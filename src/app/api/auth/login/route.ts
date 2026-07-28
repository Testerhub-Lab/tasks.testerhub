import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/server/auth/password";
import { getOrCreatePersonalWorkspace } from "@/server/queries/workspaces";
import {
  createSessionRecord,
  getRequestMeta,
  getSessionCookieOptions,
} from "@/server/auth/session";
import {
  getOrCreateZeroPersonalWorkspace,
  getZeroPasswordUser,
  usesZeroAuthStore,
} from "@/server/auth/zero-store";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as unknown;
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Некорректные данные." }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const zeroUser = usesZeroAuthStore()
    ? await getZeroPasswordUser(email)
    : null;
  const legacyUser = usesZeroAuthStore()
    ? null
    : await prisma.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true, name: true },
      });
  const user = zeroUser
    ? {
        id: zeroUser.id,
        passwordHash: zeroUser.passwordHash,
        name: zeroUser.displayName,
      }
    : legacyUser;

  if (!user?.passwordHash) {
    return NextResponse.json({ ok: false, error: "Неверный email или пароль." }, { status: 401 });
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ ok: false, error: "Неверный email или пароль." }, { status: 401 });
  }

  const workspaceID = usesZeroAuthStore()
    ? await getOrCreateZeroPersonalWorkspace({
        userID: user.id,
        displayName: user.name,
      })
    : (
        await getOrCreatePersonalWorkspace({
          userId: user.id,
          name: user.name ? `${user.name}'s Workspace` : null,
        })
      ).id;

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
