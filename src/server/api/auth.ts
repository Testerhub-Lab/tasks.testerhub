import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ApiError } from "./errors";
import {
  hasApiScopes,
  type ApiScope,
} from "./scopes";
import {
  getApiTokenPrefix,
  verifyApiToken,
} from "./tokens";

export type ApiActor = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};

export type ApiContext = {
  requestId: string;
  tokenId: string;
  tokenName: string;
  scopes: string[];
  user: ApiActor;
};

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() ?? null;
}

export async function authenticateApiRequest(
  request: Request,
  requiredScopes: readonly ApiScope[]
): Promise<ApiContext> {
  const plainToken = getBearerToken(request);
  const tokenPrefix = plainToken ? getApiTokenPrefix(plainToken) : null;
  if (!plainToken || !tokenPrefix) {
    throw new ApiError(401, "unauthorized", "Требуется Bearer token");
  }

  const token = await prisma.apiToken.findUnique({
    where: { tokenPrefix },
    select: {
      id: true,
      name: true,
      tokenHash: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      },
    },
  });

  const now = new Date();
  const isUsable =
    token &&
    !token.revokedAt &&
    (!token.expiresAt || token.expiresAt > now) &&
    verifyApiToken(plainToken, token.tokenHash);
  if (!isUsable) {
    throw new ApiError(401, "unauthorized", "Токен недействителен или отозван");
  }

  if (!hasApiScopes(token.scopes, requiredScopes)) {
    throw new ApiError(
      403,
      "insufficient_scope",
      `Недостаточно scopes: ${requiredScopes.join(", ")}`
    );
  }

  await prisma.apiToken.update({
    where: { id: token.id },
    data: { lastUsedAt: now },
    select: { id: true },
  });

  return {
    requestId: request.headers.get("x-request-id") ?? randomUUID(),
    tokenId: token.id,
    tokenName: token.name,
    scopes: token.scopes,
    user: token.user,
  };
}
