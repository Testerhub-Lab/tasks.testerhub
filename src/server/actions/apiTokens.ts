"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth/session";
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

  const activeTokenCount = await prisma.apiToken.count({
    where: { userId: user.id, revokedAt: null },
  });
  if (activeTokenCount >= 20) {
    return {
      ok: false as const,
      formError: "Сначала отзовите один из активных токенов",
    };
  }

  const generated = generateApiToken();
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;
  const scopes = normalizeApiScopes(parsed.data.scopes);

  const token = await prisma.apiToken.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      tokenPrefix: generated.tokenPrefix,
      tokenHash: generated.tokenHash,
      scopes,
      expiresAt,
    },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      scopes: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });

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

  const result = await prisma.apiToken.updateMany({
    where: {
      id: parsed.data.tokenId,
      userId: user.id,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false as const, formError: "Токен уже отозван" };
  }

  revalidatePath("/settings/integrations");
  return { ok: true as const, revokedAt: new Date().toISOString() };
}
