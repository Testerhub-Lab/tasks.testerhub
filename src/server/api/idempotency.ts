import { randomUUID } from "node:crypto";
import type { ZeroTransaction } from "@/zero/db";
import type { ApiContext } from "./auth";
import { ApiError } from "./errors";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new ApiError(
      400,
      "invalid_idempotency_key",
      "Для создающего запроса нужен корректный Idempotency-Key"
    );
  }
  return key;
}

export async function getIdempotentResponse(
  transaction: ZeroTransaction,
  context: ApiContext,
  key: string,
  operation: string
) {
  await transaction.dbTransaction.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`api-idempotency:${context.tokenId}:${key}`]
  );
  await transaction.dbTransaction.query(
    `DELETE FROM api_idempotency_keys
     WHERE api_token_id = $1 AND key = $2 AND expires_at <= now()`,
    [context.tokenId, key]
  );
  const rows = (await transaction.dbTransaction.query(
    `SELECT operation, response, status_code
     FROM api_idempotency_keys
     WHERE api_token_id = $1 AND key = $2`,
    [context.tokenId, key]
  )) as Array<{
    operation: string;
    response: unknown;
    status_code: number;
  }>;
  const stored = rows[0];
  if (!stored) return null;
  if (stored.operation !== operation) {
    throw new ApiError(
      409,
      "idempotency_conflict",
      "Idempotency-Key уже использован для другой операции"
    );
  }
  return {
    response: stored.response,
    statusCode: stored.status_code,
  };
}

export async function storeIdempotentResponse(
  transaction: ZeroTransaction,
  context: ApiContext,
  input: {
    key: string;
    operation: string;
    response: unknown;
    statusCode: number;
  }
) {
  await transaction.dbTransaction.query(
    `INSERT INTO api_idempotency_keys (
       id, api_token_id, key, operation, response, status_code, expires_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      randomUUID(),
      context.tokenId,
      input.key,
      input.operation,
      JSON.stringify(input.response),
      input.statusCode,
      new Date(Date.now() + IDEMPOTENCY_TTL_MS),
    ]
  );
}
