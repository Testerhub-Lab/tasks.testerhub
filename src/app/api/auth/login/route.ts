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
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  if (!user?.passwordHash) {
    return NextResponse.json({ ok: false, error: "Неверный email или пароль." }, { status: 401 });
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ ok: false, error: "Неверный email или пароль." }, { status: 401 });
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true },
  });
  const personalWorkspace = await getOrCreatePersonalWorkspace({
    userId: user.id,
    name: profile?.name ? `${profile.name}'s Workspace` : null,
  });

  const { token, expiresAt } = await createSessionRecord(user.id, await getRequestMeta());
  const res = NextResponse.json({ ok: true });
  res.cookies.set("th_session", token, getSessionCookieOptions(expiresAt));
  res.cookies.set("th_workspace", personalWorkspace.id, {
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
