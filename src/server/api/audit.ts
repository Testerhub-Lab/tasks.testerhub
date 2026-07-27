import { randomUUID } from "node:crypto";
import type { ZeroTransaction } from "@/zero/db";
import type { ApiContext } from "./auth";

export type ApiAuditInput = {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: unknown;
};

export async function recordApiAudit(
  transaction: ZeroTransaction,
  context: ApiContext,
  input: ApiAuditInput
) {
  await transaction.dbTransaction.query(
    `INSERT INTO api_audit_logs (
       id, user_id, api_token_id, action, resource_type, resource_id,
       request_id, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      randomUUID(),
      context.user.id,
      context.tokenId,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      context.requestId,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
    ]
  );
}
