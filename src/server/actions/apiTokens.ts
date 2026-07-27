"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import {
  ApiTokenLimitError,
  createApiTokenRecord,
  revokeApiToken,
} from "@/server/api/token-store";
import {
  API_SCOPES,
  normalizeApiScopes,
} from "@/server/api/scopes";
import { generateApiToken } from "@/server/api/tokens";

const createTokenSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
  expiresInDays: z.union([
    z.literal(30),
    z.literal(90),
    z.literal(365),
    z.null(),
  ]),
});

const revokeTokenSchema = z.object({
  tokenId: z.string().min(1),
});

export async function createApiTokenAction(input: {
  name: string;
  scopes: string[];
  expiresInDays: 30 | 90 | 365 | null;
}) {
  const parsed = createTokenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, formError: "Проверьте настройки токена" };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false as const, formError: "Требуется авторизация" };
  }

  const generated = generateApiToken();
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;
  const scopes = normalizeApiScopes(parsed.data.scopes);

  let token;
  try {
    token = await createApiTokenRecord({
      userID: user.id,
      displayName: user.name,
      name: parsed.data.name,
      tokenPrefix: generated.tokenPrefix,
      tokenHash: generated.tokenHash,
      scopes,
      expiresAt,
    });
  } catch (error) {
    if (error instanceof ApiTokenLimitError) {
      return {
        ok: false as const,
        formError: "Сначала отзовите один из активных токенов",
      };
    }
    throw error;
  }

  revalidatePath("/settings/integrations");
  return {
    ok: true as const,
    plainToken: generated.plainToken,
    token: {
      ...token,
      createdAt: token.createdAt.toISOString(),
      expiresAt: token.expiresAt?.toISOString() ?? null,
      lastUsedAt: null,
      revokedAt: null,
    },
  };
}

export async function revokeApiTokenAction(input: { tokenId: string }) {
  const parsed = revokeTokenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, formError: "Некорректный токен" };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false as const, formError: "Требуется авторизация" };
  }

  const revokedAt = await revokeApiToken(user.id, parsed.data.tokenId);
  if (!revokedAt) {
    return { ok: false as const, formError: "Токен уже отозван" };
  }

  revalidatePath("/settings/integrations");
  return { ok: true as const, revokedAt: revokedAt.toISOString() };
}
