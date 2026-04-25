import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import {
  exchangeAuthentikCode,
  getAuthentikUserinfo,
  isAuthentikConfigured,
} from "@/server/auth/authentik";
import {
  createSessionRecord,
  getRequestMeta,
  getSessionCookieOptions,
} from "@/server/auth/session";

export const runtime = "nodejs";

const STATE_COOKIE = "ak_state";
const RETURN_TO_COOKIE = "ak_return_to";

function getPublicBaseUrl(request: NextRequest): string {
  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (appUrl) return appUrl;

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

function clearAuthCookies(res: NextResponse) {
  const opts = { path: "/", maxAge: 0 };
  res.cookies.set(STATE_COOKIE, "", opts);
  res.cookies.set(RETURN_TO_COOKIE, "", opts);
}

export async function GET(request: NextRequest) {
  const baseUrl = getPublicBaseUrl(request);

  if (!isAuthentikConfigured()) {
    return NextResponse.redirect(new URL("/sso/error?reason=exchange_failed", baseUrl));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");

  const jar = await cookies();
  const stateCookie = jar.get(STATE_COOKIE)?.value;
  const returnTo = jar.get(RETURN_TO_COOKIE)?.value ?? "/board";

  const res = NextResponse.redirect(new URL(returnTo, baseUrl));
  clearAuthCookies(res);

  if (!code || !stateParam || stateParam !== stateCookie) {
    return NextResponse.redirect(new URL("/sso/error?reason=missing_code", baseUrl));
  }

  const redirectUri = `${baseUrl}/api/auth/callback/authentik`;

  let accessToken: string;
  try {
    const tokens = await exchangeAuthentikCode(code, redirectUri);
    accessToken = tokens.accessToken;
  } catch (err) {
    console.warn("[authentik] token exchange failed", err);
    return NextResponse.redirect(new URL("/sso/error?reason=exchange_failed", baseUrl));
  }

  let userinfo: Awaited<ReturnType<typeof getAuthentikUserinfo>>;
  try {
    userinfo = await getAuthentikUserinfo(accessToken);
  } catch (err) {
    console.warn("[authentik] userinfo failed", err);
    return NextResponse.redirect(new URL("/sso/error?reason=exchange_failed", baseUrl));
  }

  if (!userinfo.email) {
    console.warn("[authentik] userinfo missing email", userinfo);
    return NextResponse.redirect(new URL("/sso/error?reason=exchange_failed", baseUrl));
  }

  try {
    const user = await prisma.user.upsert({
      where: { testerHubId: userinfo.sub },
      create: {
        testerHubId: userinfo.sub,
        email: userinfo.email,
        name: userinfo.name ?? null,
      },
      update: {
        email: userinfo.email,
        name: userinfo.name ?? undefined,
      },
      select: { id: true },
    });

    const { token, expiresAt } = await createSessionRecord(
      user.id,
      await getRequestMeta()
    );

    res.cookies.set("th_session", token, getSessionCookieOptions(expiresAt));
    res.cookies.set("th_auth_blocked", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch (err) {
    console.warn("[authentik] session create failed", err);
    return NextResponse.redirect(new URL("/sso/error?reason=session_failed", baseUrl));
  }
}
