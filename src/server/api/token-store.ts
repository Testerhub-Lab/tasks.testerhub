import { randomUUID } from "node:crypto";
import { getZeroPool } from "@/zero/db";
import type { ApiScope } from "./scopes";

type ApiTokenViewRow = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  created_at: Date;
  expires_at: Date | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
};

type ApiTokenAuthRow = ApiTokenViewRow & {
  token_hash: string;
  user_id: string;
  display_name: string | null;
};

export type ApiTokenView = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export class ApiTokenLimitError extends Error {
  constructor() {
    super("API token limit reached");
  }
}

function tokenView(row: ApiTokenViewRow): ApiTokenView {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    scopes: row.scopes,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export async function listApiTokens(userID: string) {
  const result = await getZeroPool().query<ApiTokenViewRow>(
    `SELECT
       id, name, token_prefix, scopes, created_at, expires_at, last_used_at,
       revoked_at
     FROM api_tokens
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userID]
  );
  return result.rows.map(tokenView);
}

export async function createApiTokenRecord(input: {
  userID: string;
  displayName?: string | null;
  name: string;
  tokenPrefix: string;
  tokenHash: string;
  scopes: ApiScope[];
  expiresAt: Date | null;
}) {
  const client = await getZeroPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (id, display_name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE
       SET display_name = coalesce(EXCLUDED.display_name, users.display_name),
           updated_at = now()`,
      [input.userID, input.displayName ?? null]
    );
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`api-tokens:${input.userID}`]
    );
    const count = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM api_tokens
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [input.userID]
    );
    if (Number(count.rows[0]?.count ?? 0) >= 20) {
      throw new ApiTokenLimitError();
    }

    const result = await client.query<ApiTokenViewRow>(
      `INSERT INTO api_tokens (
         id, user_id, name, token_prefix, token_hash, scopes, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6::text[], $7)
       RETURNING
         id, name, token_prefix, scopes, created_at, expires_at, last_used_at,
         revoked_at`,
      [
        randomUUID(),
        input.userID,
        input.name,
        input.tokenPrefix,
        input.tokenHash,
        input.scopes,
        input.expiresAt,
      ]
    );
    await client.query("COMMIT");
    return tokenView(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeApiToken(userID: string, tokenID: string) {
  const result = await getZeroPool().query<{ revoked_at: Date }>(
    `UPDATE api_tokens
     SET revoked_at = now()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
     RETURNING revoked_at`,
    [tokenID, userID]
  );
  return result.rows[0]?.revoked_at ?? null;
}

export async function getApiTokenForAuthentication(tokenPrefix: string) {
  const result = await getZeroPool().query<ApiTokenAuthRow>(
    `SELECT
       token.id,
       token.user_id,
       token.name,
       token.token_prefix,
       token.token_hash,
       token.scopes,
       token.created_at,
       token.expires_at,
       token.last_used_at,
       token.revoked_at,
       actor.display_name
     FROM api_tokens AS token
     JOIN users AS actor ON actor.id = token.user_id
     WHERE token.token_prefix = $1`,
    [tokenPrefix]
  );
  return result.rows[0] ?? null;
}

export async function touchApiToken(tokenID: string, usedAt: Date) {
  await getZeroPool().query(
    "UPDATE api_tokens SET last_used_at = $2 WHERE id = $1",
    [tokenID, usedAt]
  );
}
