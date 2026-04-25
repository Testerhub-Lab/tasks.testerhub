export type DisplayNameInput = {
  user?: { name: string | null; email: string | null } | null;
  fallbackName?: string | null;
  guestLabel?: string;
};

export function getDisplayName(input: DisplayNameInput): string {
  const guestLabel = input.guestLabel ?? "Гость";
  const name = input.user?.name?.trim() ?? "";
  const email = input.user?.email?.trim() ?? "";
  const fallback = input.fallbackName?.trim() ?? "";

  const primary = name || email;
  if (primary) return primary;
  return fallback || guestLabel;
}
