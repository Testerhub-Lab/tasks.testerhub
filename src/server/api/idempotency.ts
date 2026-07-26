import type { Prisma } from "@prisma/client";
import type { ApiContext } from "./auth";
import { ApiError } from "./errors";

type IdempotencyDatabase = Pick<
  Prisma.TransactionClient,
  "apiIdempotencyKey"
>;

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
  database: IdempotencyDatabase,
  context: ApiContext,
  key: string,
  operation: string
) {
  const stored = await database.apiIdempotencyKey.findUnique({
    where: {
      apiTokenId_key: {
        apiTokenId: context.tokenId,
        key,
      },
    },
    select: {
      operation: true,
      response: true,
      statusCode: true,
      expiresAt: true,
    },
  });
  if (!stored) return null;
  if (stored.expiresAt <= new Date()) {
    await database.apiIdempotencyKey.delete({
      where: {
        apiTokenId_key: {
          apiTokenId: context.tokenId,
          key,
        },
      },
    });
    return null;
  }
  if (stored.operation !== operation) {
    throw new ApiError(
      409,
      "idempotency_conflict",
      "Idempotency-Key уже использован для другой операции"
    );
  }
  return stored;
}

export async function storeIdempotentResponse(
  database: IdempotencyDatabase,
  context: ApiContext,
  input: {
    key: string;
    operation: string;
    response: Prisma.InputJsonValue;
    statusCode: number;
  }
) {
  await database.apiIdempotencyKey.create({
    data: {
      apiTokenId: context.tokenId,
      key: input.key,
      operation: input.operation,
      response: input.response,
      statusCode: input.statusCode,
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
    },
    select: { id: true },
  });
}
