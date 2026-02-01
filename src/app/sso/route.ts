import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { exchangeCode, SsoExchangeError } from "@/server/auth/sso";
import {
  createSessionRecord,
  getRequestMeta,
  getSessionCookieOptions,
} from "@/server/auth/session";

export const runtime = "nodejs";

function getReasonFromExchangeError(error: SsoExchangeError): string {
  if (error.status === 400) return "invalid_code";
  return "exchange_failed";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/sso/error?reason=missing_code", request.url));
  }

  let exchangeResult: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    exchangeResult = await exchangeCode(code);
  } catch (error) {
    if (error instanceof SsoExchangeError) {
      console.warn("[sso] exchange failed", {
        status: error.status,
        kind: error.kind,
      });
      const reason = getReasonFromExchangeError(error);
      return NextResponse.redirect(new URL(`/sso/error?reason=${reason}`, request.url));
    }

    console.warn("[sso] exchange error", { message: getErrorMessage(error) });
    return NextResponse.redirect(new URL("/sso/error?reason=exchange_failed", request.url));
  }

  console.info("[sso] exchange ok", {
    status: exchangeResult.status,
    ok: exchangeResult.ok,
  });

  try {
    const claims = exchangeResult.claims;

    const user = await prisma.user.upsert({
      where: { testerHubId: claims.sub },
      create: {
        testerHubId: claims.sub,
        email: claims.email,
        name: claims.name ?? null,
      },
      update: {
        email: claims.email,
        name: claims.name ?? undefined,
      },
      select: { id: true },
    });

    console.info("[sso] user upsert ok", { userId: user.id });

    const { token, expiresAt } = await createSessionRecord(
      user.id,
      await getRequestMeta()
    );
    console.info("[sso] session create ok");

    const response = NextResponse.redirect(new URL("/board", request.url));
    response.cookies.set("th_session", token, getSessionCookieOptions(expiresAt));
    console.info("[sso] cookie set ok");
    console.info("[sso] redirecting", { to: "/board" });
    return response;
  } catch (error) {
    console.warn("[sso] local session/user failed", {
      message: getErrorMessage(error),
      code: getErrorCode(error),
    });
    return NextResponse.redirect(new URL("/sso/error?reason=session_failed", request.url));
  }
}
