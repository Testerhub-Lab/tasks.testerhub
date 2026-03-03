import { NextResponse, type NextRequest } from "next/server";
import {
  buildAuthentikAuthorizeUrl,
  generateAuthentikState,
  isAuthentikConfigured,
} from "@/server/auth/authentik";
import { getCookieSameSite } from "@/server/auth/session";

export const runtime = "nodejs";

const STATE_COOKIE = "ak_state";
const RETURN_TO_COOKIE = "ak_return_to";
const MAX_AGE = 60 * 10; // 10 min

export async function GET(request: NextRequest) {
  if (!isAuthentikConfigured()) {
    return NextResponse.json({ error: "Authentik is not configured" }, { status: 503 });
  }

  const redirectParam = request.nextUrl.searchParams.get("redirect");
  const returnTo =
    redirectParam && redirectParam.startsWith("/") ? redirectParam : "/board";

  const state = generateAuthentikState();
  const baseUrl =
    process.env.APP_URL?.trim().replace(/\/$/, "") || request.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/auth/callback/authentik`;

  const authorizeUrl = await buildAuthentikAuthorizeUrl({
    redirectUri,
    state,
  });

  const res = NextResponse.redirect(authorizeUrl);
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: getCookieSameSite(),
    path: "/",
    maxAge: MAX_AGE,
  } as const;

  res.cookies.set(STATE_COOKIE, state, opts);
  res.cookies.set(RETURN_TO_COOKIE, returnTo, opts);

  return res;
}
