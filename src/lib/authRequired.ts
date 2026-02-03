import { toast } from "@/components/ui/toast";

type AuthRequiredSource = { formError?: string | null; code?: string | null };

export function isAuthRequiredError(source: AuthRequiredSource | null | undefined): boolean {
  if (!source) return false;
  if (source.code === "AUTH_REQUIRED") return true;
  return source.formError === "Требуется авторизация";
}

function getMainAppBaseUrl(): string | null {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.getAttribute("data-main-app-base-url");
  return value && value.trim().length ? value : null;
}

export function getSignInUrl(currentPath: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const baseUrl = getMainAppBaseUrl() ?? origin;
  const redirectToTasks = `${origin}/sso?redirect=${encodeURIComponent(currentPath)}`;
  const url = new URL("/sso/start", baseUrl);
  url.searchParams.set("audience", "tasks");
  url.searchParams.set("redirect", redirectToTasks);
  return url.toString();
}

export function showAuthRequiredToast(): void {
  if (typeof window === "undefined") return;
  const currentPath = `${window.location.pathname}${window.location.search}`;
  const url = getSignInUrl(currentPath);
  toast(
    "error",
    "Нужна авторизация",
    "Чтобы продолжить, войдите через основной аккаунт.",
    4200,
    {
      label: "Sign in",
      onClick: () => {
        window.location.href = url;
      },
    }
  );
}
