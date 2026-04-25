import { toast } from "@/components/ui/toast";

type AuthRequiredSource = { formError?: string | null; code?: string | null };

export function isAuthRequiredError(source: AuthRequiredSource | null | undefined): boolean {
  if (!source) return false;
  if (source.code === "AUTH_REQUIRED") return true;
  return source.formError === "Требуется авторизация";
}

export function getSignInUrl(currentPath: string): string {
  return `/signin?redirect=${encodeURIComponent(currentPath)}`;
}

export function showAuthRequiredToast(): void {
  if (typeof window === "undefined") return;
  const currentPath = `${window.location.pathname}${window.location.search}`;
  const url = getSignInUrl(currentPath);
  toast(
    "error",
    "Нужна авторизация",
    "Чтобы продолжить, войдите в аккаунт.",
    4200,
    {
      label: "Sign in",
      onClick: () => {
        window.location.href = url;
      },
    }
  );
}
