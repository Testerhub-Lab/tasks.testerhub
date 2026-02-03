import { NextResponse } from "next/server";
import { clearSession, getAuthBlockedCookieOptions } from "@/server/auth/session";

export const runtime = "nodejs";

export async function POST() {
  await clearSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set("th_auth_blocked", "1", getAuthBlockedCookieOptions(60 * 60 * 24 * 7));
  return res;
}
