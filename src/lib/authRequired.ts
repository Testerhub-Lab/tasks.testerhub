type AuthRequiredSource = { formError?: string | null; code?: string | null };

export function isAuthRequiredError(source: AuthRequiredSource | null | undefined): boolean {
  if (!source) return false;
  if (source.code === "AUTH_REQUIRED") return true;
  return source.formError === "Требуется авторизация";
}

export function getSignInUrl(currentPath: string, mainAppBaseUrl: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const baseUrl = mainAppBaseUrl || origin;
  const redirectToTasks = `${origin}/sso?redirect=${encodeURIComponent(currentPath)}`;
  const url = new URL("/sso/start", baseUrl);
  url.searchParams.set("audience", "tasks");
  url.searchParams.set("redirect", redirectToTasks);
  return url.toString();
}
