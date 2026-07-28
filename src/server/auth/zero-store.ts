import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getZeroPool } from "../../zero/db";
import { DEFAULT_WORKFLOW_STATES, workspaceSlug } from "../../zero/stage3";

export class ZeroAuthIdentityConflictError extends Error {
  constructor() {
    super("Password identity already exists");
    this.name = "ZeroAuthIdentityConflictError";
  }
}

export type ZeroPasswordUser = {
  id: string;
  email: string;
  displayName: string | null;
  passwordHash: string;
};

export type ZeroSessionUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export function usesZeroAuthStore() {
  return process.env.PULSAR_AUTH_STORE?.trim().toLowerCase() === "zero";
}

export function normalizeSessionIPAddress(value?: string | null) {
  const candidate = value?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

async function createPersonalWorkspace(
  client: PoolClient,
  input: {
    userID: string;
    displayName?: string | null;
  }
) {
  const workspaceID = randomUUID();
  const workflowID = randomUUID();
  const workspaceName = input.displayName?.trim()
    ? `${input.displayName.trim()}'s Workspace`
    : "My Workspace";

  await client.query(
    `INSERT INTO workspaces (
       id, name, slug, created_by_id
     ) VALUES ($1, $2, $3, $4)`,
    [
      workspaceID,
      workspaceName,
      workspaceSlug(workspaceName, input.userID),
      input.userID,
    ]
  );
  await client.query(
    `INSERT INTO workspace_members (
       workspace_id, user_id, role
     ) VALUES ($1, $2, 'OWNER')`,
    [workspaceID, input.userID]
  );
  await client.query(
    `INSERT INTO workflows (
       id, workspace_id, name, is_default
     ) VALUES ($1, $2, 'Default', true)`,
    [workflowID, workspaceID]
  );
  for (const state of DEFAULT_WORKFLOW_STATES) {
    await client.query(
      `INSERT INTO workflow_states (
         id, workspace_id, workflow_id, name, category, color, rank
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        workspaceID,
        workflowID,
        state.name,
        state.category,
        state.color,
        state.rank,
      ]
    );
  }
  await client.query(
    `INSERT INTO audit_events (
       id, workspace_id, actor_id, action, entity_type, entity_id
     ) VALUES ($1, $2, $3, 'workspace.created', 'workspace', $2)`,
    [randomUUID(), workspaceID, input.userID]
  );

  return workspaceID;
}

async function findWorkspaceForUser(client: PoolClient, userID: string) {
  const result = await client.query<{ id: string }>(
    `SELECT workspace.id
     FROM workspace_members AS membership
     JOIN workspaces AS workspace ON workspace.id = membership.workspace_id
     WHERE membership.user_id = $1 AND workspace.archived_at IS NULL
     ORDER BY
       CASE membership.role WHEN 'OWNER' THEN 0 ELSE 1 END,
       workspace.created_at,
       workspace.id
     LIMIT 1`,
    [userID]
  );
  return result.rows[0]?.id ?? null;
}

export async function registerZeroPasswordUser(input: {
  email: string;
  passwordHash: string;
  displayName?: string | null;
}) {
  const email = normalizedEmail(input.email);
  const userID = randomUUID();
  const identityID = randomUUID();
  const client = await getZeroPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`password-identity:${email}`]
    );
    const existing = await client.query<{ id: string }>(
      `SELECT id
       FROM auth_identities
       WHERE provider = 'password' AND provider_subject = $1`,
      [email]
    );
    if (existing.rowCount) throw new ZeroAuthIdentityConflictError();

    await client.query(
      `INSERT INTO users (id, display_name)
       VALUES ($1, $2)`,
      [userID, input.displayName?.trim() || null]
    );
    await client.query(
      `INSERT INTO auth_identities (
         id, user_id, provider, provider_subject, password_hash
       ) VALUES ($1, $2, 'password', $3, $4)`,
      [identityID, userID, email, input.passwordHash]
    );
    const workspaceID = await createPersonalWorkspace(client, {
      userID,
      displayName: input.displayName,
    });

    await client.query("COMMIT");
    return {
      id: userID,
      email,
      displayName: input.displayName?.trim() || null,
      workspaceID,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new ZeroAuthIdentityConflictError();
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getZeroPasswordUser(
  email: string
): Promise<ZeroPasswordUser | null> {
  const result = await getZeroPool().query<{
    id: string;
    display_name: string | null;
    provider_subject: string;
    password_hash: string;
  }>(
    `SELECT
       actor.id,
       actor.display_name,
       identity.provider_subject,
       identity.password_hash
     FROM auth_identities AS identity
     JOIN users AS actor ON actor.id = identity.user_id
     WHERE
       identity.provider = 'password'
       AND identity.provider_subject = $1`,
    [normalizedEmail(email)]
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        email: row.provider_subject,
        displayName: row.display_name,
        passwordHash: row.password_hash,
      }
    : null;
}

export async function getOrCreateZeroPersonalWorkspace(input: {
  userID: string;
  displayName?: string | null;
}) {
  const client = await getZeroPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`personal-workspace:${input.userID}`]
    );
    const existing = await findWorkspaceForUser(client, input.userID);
    const workspaceID =
      existing ?? (await createPersonalWorkspace(client, input));
    await client.query("COMMIT");
    return workspaceID;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function hasZeroWorkspaceMembership(
  userID: string,
  workspaceID: string
) {
  const result = await getZeroPool().query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM workspace_members AS membership
       JOIN workspaces AS workspace
         ON workspace.id = membership.workspace_id
       WHERE
         membership.user_id = $1
         AND membership.workspace_id::text = $2
         AND workspace.archived_at IS NULL
     ) AS present`,
    [userID, workspaceID]
  );
  return result.rows[0]?.present ?? false;
}

export async function createZeroSessionRecord(input: {
  userID: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}) {
  await getZeroPool().query(
    `INSERT INTO sessions (
       id, user_id, token_hash, expires_at, user_agent, ip_address
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      randomUUID(),
      input.userID,
      input.tokenHash,
      input.expiresAt,
      input.userAgent ?? null,
      normalizeSessionIPAddress(input.ip),
    ]
  );
}

export async function getZeroSessionUser(
  tokenHash: string,
  now: Date
): Promise<ZeroSessionUser | null> {
  const result = await getZeroPool().query<{
    id: string;
    display_name: string | null;
    provider_subject: string;
  }>(
    `SELECT
       actor.id,
       actor.display_name,
       identity.provider_subject
     FROM sessions AS session
     JOIN users AS actor ON actor.id = session.user_id
     JOIN auth_identities AS identity
       ON identity.user_id = actor.id AND identity.provider = 'password'
     WHERE
       session.token_hash = $1
       AND session.revoked_at IS NULL
       AND session.expires_at > $2
     ORDER BY identity.created_at
     LIMIT 1`,
    [tokenHash, now]
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        email: row.provider_subject,
        displayName: row.display_name,
      }
    : null;
}

export async function revokeZeroSession(tokenHash: string) {
  await getZeroPool().query(
    `UPDATE sessions
     SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}
