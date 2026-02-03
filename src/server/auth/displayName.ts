export type DisplayNameInput = {
  user?: { name: string | null; email: string | null } | null;
  fallbackName?: string | null;
  guestLabel?: string;
  defaultLabel?: string;
};

export function getDisplayName(input: DisplayNameInput): string {
  const guestLabel = input.guestLabel ?? "Гость";
  const defaultLabel = input.defaultLabel ?? "User";
  const name = input.user?.name?.trim() ?? "";
  const email = input.user?.email?.trim() ?? "";
  const fallback = input.fallbackName?.trim() ?? "";

  if (input.user) {
    return name || email || defaultLabel;
  }

  return fallback || guestLabel;
}
