import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/server/auth/password";
import { getOrCreatePersonalWorkspace } from "@/server/queries/workspaces";
import {
  createSessionRecord,
  getRequestMeta,
  getSessionCookieOptions,
} from "@/server/auth/session";
import {
  registerZeroPasswordUser,
  usesZeroAuthStore,
  ZeroAuthIdentityConflictError,
} from "@/server/auth/zero-store";

export const runtime = "nodejs";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(2).max(120).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as unknown;
  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Некорректные данные." }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const name = parsed.data.name?.trim() || null;
  const passwordHash = await hashPassword(parsed.data.password);

  let user: { id: string };
  let workspaceID: string;

  if (usesZeroAuthStore()) {
    try {
      const registered = await registerZeroPasswordUser({
        email,
        passwordHash,
        displayName: name,
      });
      user = { id: registered.id };
      workspaceID = registered.workspaceID;
    } catch (error) {
      if (error instanceof ZeroAuthIdentityConflictError) {
        return NextResponse.json(
          { ok: false, error: "Пользователь с таким email уже существует." },
          { status: 409 }
        );
      }
      throw error;
    }
  } else {
    const legacyUser = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true },
      });

      if (existing?.passwordHash) {
        return null;
      }

      if (existing) {
        return tx.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            name: name ?? undefined,
          },
          select: { id: true },
        });
      }

      return tx.user.create({
        data: {
          email,
          name,
          passwordHash,
        },
        select: { id: true },
      });
    });

    if (!legacyUser) {
      return NextResponse.json(
        { ok: false, error: "Пользователь с таким email уже существует." },
        { status: 409 }
      );
    }

    user = legacyUser;
    workspaceID = (
      await getOrCreatePersonalWorkspace({
        userId: user.id,
        name: name ? `${name}'s Workspace` : null,
      })
    ).id;
  }

  const { token, expiresAt } = await createSessionRecord(user.id, await getRequestMeta());
  const res = NextResponse.json({ ok: true });
  res.cookies.set("th_session", token, getSessionCookieOptions(expiresAt));
  res.cookies.set("th_workspace", workspaceID, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.cookies.set("th_auth_blocked", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
