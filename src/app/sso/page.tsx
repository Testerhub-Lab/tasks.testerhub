import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { createSession, getRequestMeta } from "@/server/auth/session";
import { exchangeCode } from "@/server/auth/sso";

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

  try {
    const claims = await exchangeCode(code);

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

    await createSession(user.id, await getRequestMeta());
    redirect("/board");
  } catch {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">SSO error</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          The SSO code is invalid, expired, or already used.
        </p>
        <a className="text-sm text-[var(--color-primary)] underline" href={getReturnUrl()}>
          Back to main app
        </a>
      </div>
    );
  }
}
