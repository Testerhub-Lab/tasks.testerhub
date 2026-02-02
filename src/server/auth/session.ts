import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import { type Role } from "@prisma/client";
import { fetchMainCurrentUser } from "./mainApp";

const COOKIE_NAME = "th_session";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  testerHubId: string | null;
};

export type SessionMeta = {
  userAgent?: string | null;
  ip?: string | null;
};

function getSessionTtlDays(): number {
  const raw = process.env.SESSION_TTL_DAYS;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

export function getCookieSameSite(): "lax" | "strict" | "none" {
  const raw = (process.env.COOKIE_SAMESITE ?? "lax").toLowerCase();
  if (raw === "strict" || raw === "none") return raw;
  return "lax";
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function makeToken(): string {
  return randomBytes(32).toString("base64url");
}

function buildExpiresAt(now = Date.now()): Date {
  const ttlMs = getSessionTtlDays() * 24 * 60 * 60 * 1000;
  return new Date(now + ttlMs);
}

export function getSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: getCookieSameSite(),
    path: "/",
    expires: expiresAt,
  } as const;
}

async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, getSessionCookieOptions(expiresAt));
}

export async function getRequestMeta(): Promise<SessionMeta> {
  const h = await headers();
  const userAgent = h.get("user-agent");
  const forwardedFor = h.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() ?? null : null;
  return { userAgent: userAgent ?? null, ip };
}

export async function createSessionRecord(userId: string, meta: SessionMeta = {}) {
  const token = makeToken();
  const tokenHash = hashToken(token);
  const expiresAt = buildExpiresAt();

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    },
    select: { id: true },
  });

  return { token, expiresAt };
}

export async function createSession(userId: string, meta: SessionMeta = {}) {
  const { token, expiresAt } = await createSessionRecord(userId, meta);
  await setSessionCookie(token, expiresAt);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    const now = new Date();

    const session = await prisma.session.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            testerHubId: true,
          },
        },
      },
    });

    if (session?.user) return session.user;
  }

  try {
    const h = await headers();
    const cookieHeader = h.get("cookie");
    const mainUser = await fetchMainCurrentUser(cookieHeader);
    if (!mainUser) return null;

    const user = await prisma.user.upsert({
      where: { testerHubId: mainUser.id },
      create: {
        testerHubId: mainUser.id,
        email: mainUser.email,
        name: mainUser.name ?? null,
      },
      update: {
        email: mainUser.email,
        name: mainUser.name ?? undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        testerHubId: true,
      },
    });

    await createSession(user.id, await getRequestMeta());
    return user;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    await prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: getCookieSameSite(),
    path: "/",
    expires: new Date(0),
  });
}
