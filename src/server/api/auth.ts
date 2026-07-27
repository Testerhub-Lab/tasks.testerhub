import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import {
  hasApiScopes,
  type ApiScope,
} from "./scopes";
import {
  getApiTokenPrefix,
  verifyApiToken,
} from "./tokens";
import {
  getApiTokenForAuthentication,
  touchApiToken,
} from "./token-store";

export type ApiActor = {
  id: string;
  email: null;
  name: string | null;
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

  const token = await getApiTokenForAuthentication(tokenPrefix);

  const now = new Date();
  const isUsable =
    token &&
    !token.revoked_at &&
    (!token.expires_at || token.expires_at > now) &&
    verifyApiToken(plainToken, token.token_hash);
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

  await touchApiToken(token.id, now);

  return {
    requestId: request.headers.get("x-request-id") ?? randomUUID(),
    tokenId: token.id,
    tokenName: token.name,
    scopes: token.scopes,
    user: {
      id: token.user_id,
      email: null,
      name: token.display_name,
    },
  };
}
