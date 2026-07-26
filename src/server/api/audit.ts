import type { Prisma } from "@prisma/client";
import type { ApiContext } from "./auth";

type AuditDatabase = Pick<Prisma.TransactionClient, "apiAuditLog">;

export type ApiAuditInput = {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  projectId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function recordApiAudit(
  database: AuditDatabase,
  context: ApiContext,
  input: ApiAuditInput
) {
  await database.apiAuditLog.create({
    data: {
      userId: context.user.id,
      apiTokenId: context.tokenId,
      projectId: input.projectId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      requestId: context.requestId,
      metadata: input.metadata,
    },
    select: { id: true },
  });
}
