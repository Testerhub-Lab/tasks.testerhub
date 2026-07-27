import { getZeroDatabase, type ZeroTransaction } from "@/zero/db";
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
    execute: (tx: ZeroTransaction) => Promise<T>;
    audit?: (response: T) => ApiAuditInput;
  }
) {
  return getZeroDatabase().transaction(async (tx) => {
    const replay = await getIdempotentResponse(
      tx,
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

    const response = await input.execute(tx);
    if (input.audit) {
      await recordApiAudit(tx, context, input.audit(response));
    }
    await storeIdempotentResponse(tx, context, {
      key: input.key,
      operation: input.operation,
      response,
      statusCode: input.statusCode,
    });
    return {
      replayed: false,
      response,
      statusCode: input.statusCode,
    };
  });
}

export async function runAuditedCommand<T>(
  context: ApiContext,
  input: {
    execute: (tx: ZeroTransaction) => Promise<T>;
    audit: (response: T) => ApiAuditInput;
  }
) {
  return getZeroDatabase().transaction(async (tx) => {
    const response = await input.execute(tx);
    await recordApiAudit(tx, context, input.audit(response));
    return response;
  });
}
