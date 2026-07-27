import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  recordApiAudit,
  type ApiAuditInput,
} from "./audit";
import type { ApiContext } from "./auth";
import {
  getIdempotentResponse,
  storeIdempotentResponse,
} from "./idempotency";

export async function runIdempotentCommand<T>(
  context: ApiContext,
  input: {
    key: string;
    operation: string;
    statusCode: number;
    execute: () => Promise<T>;
    audit?: (response: T) => ApiAuditInput;
  }
) {
  const replay = await getIdempotentResponse(
    prisma,
    context,
    input.key,
    input.operation
  );
  if (replay) {
    return {
      replayed: true,
      response: replay.response as T,
      statusCode: replay.statusCode,
    };
  }

  const response = await input.execute();
  if (input.audit) {
    await recordApiAudit(prisma, context, input.audit(response));
  }
  await storeIdempotentResponse(prisma, context, {
    key: input.key,
    operation: input.operation,
    response: response as Prisma.InputJsonValue,
    statusCode: input.statusCode,
  });
  return {
    replayed: false,
    response,
    statusCode: input.statusCode,
  };
}
