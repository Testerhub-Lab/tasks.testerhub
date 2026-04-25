type SearchParams = Record<string, string | string[] | undefined>;

interface SsoErrorPageProps {
  searchParams: Promise<SearchParams>;
}

function getReturnUrl(): string {
  return (
    process.env.MAIN_APP_RETURN_URL ??
    process.env.MAIN_APP_BASE_URL ??
    "/"
  );
}

function resolveReason(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function reasonToMessage(reason: string | null): string {
  switch (reason) {
    case "invalid_code":
      return "The SSO code is invalid, expired, or already used.";
    case "exchange_failed":
      return "SSO exchange failed.";
    case "session_failed":
      return "Failed to create local session/user.";
    case "missing_code":
      return "Missing or invalid SSO code.";
    default:
      return "SSO error.";
  }
}

export default async function SsoErrorPage({ searchParams }: SsoErrorPageProps) {
  const resolved = await searchParams;
  const reason = resolveReason(resolved.reason);
  const message = reasonToMessage(reason);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">SSO error</h1>
      <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>
      <a className="text-sm text-[var(--color-primary)] underline" href={getReturnUrl()}>
        Back to main app
      </a>
    </div>
  );
}
