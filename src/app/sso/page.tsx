import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { createSession, getRequestMeta } from "@/server/auth/session";
import { exchangeCode, SsoExchangeError } from "@/server/auth/sso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

interface SsoPageProps {
  searchParams: Promise<SearchParams>;
}

function getReturnUrl(): string {
  return (
    process.env.MAIN_APP_RETURN_URL ??
    process.env.MAIN_APP_BASE_URL ??
    "/"
  );
}

function resolveCode(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function isNextNavigationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND");
}

export default async function SsoPage({ searchParams }: SsoPageProps) {
  const resolved = await searchParams;
  const code = resolveCode(resolved.code);

  if (!code) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">SSO error</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Missing or invalid SSO code.
        </p>
        <a className="text-sm text-[var(--color-primary)] underline" href={getReturnUrl()}>
          Back to main app
        </a>
      </div>
    );
  }

  let exchangeResult: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    exchangeResult = await exchangeCode(code);
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }

    const status =
      error instanceof SsoExchangeError
        ? error.status ?? "unknown"
        : "unknown";
    const errorMessage = `SSO exchange failed (status ${status}).`;

    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">SSO error</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {errorMessage}
        </p>
        <a className="text-sm text-[var(--color-primary)] underline" href={getReturnUrl()}>
          Back to main app
        </a>
      </div>
    );
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

    await createSession(user.id, await getRequestMeta());
    console.info("[sso] session create ok");
    console.info("[sso] set cookie ok");
    console.info("[sso] redirecting", { to: "/board" });
    redirect("/board");
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }

    const errorMessage = "Failed to create local session/user.";

    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">SSO error</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {errorMessage}
        </p>
        <a className="text-sm text-[var(--color-primary)] underline" href={getReturnUrl()}>
          Back to main app
        </a>
      </div>
    );
  }
}
