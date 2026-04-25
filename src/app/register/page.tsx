import Link from "next/link";
import RegisterForm from "./RegisterForm";

type SearchParams = Record<string, string | string[] | undefined>;

interface RegisterPageProps {
  searchParams: Promise<SearchParams>;
}

function getRedirect(path: string | string[] | undefined): string {
  if (!path) return "/board";
  const p = Array.isArray(path) ? path[0] : path;
  return p && p.startsWith("/") ? p : "/board";
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const redirect = getRedirect(params.redirect);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--sep)] bg-[var(--surface-1)] p-8 shadow-lg">
        <h1 className="text-xl font-semibold text-[var(--text)]">Регистрация</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Создайте локальный аккаунт для работы в Tasks Tracker.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <RegisterForm redirect={redirect} />
          <Link
            href={`/signin?redirect=${encodeURIComponent(redirect)}`}
            className="text-center text-sm text-[var(--muted)] underline hover:text-[var(--text)]"
          >
            Уже есть аккаунт? Войти
          </Link>
        </div>
      </div>
    </div>
  );
}
