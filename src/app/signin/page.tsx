import Link from "next/link";
import SignInButton from "./SignInButton";

type SearchParams = Record<string, string | string[] | undefined>;

interface SignInPageProps {
  searchParams: Promise<SearchParams>;
}

function getRedirect(path: string | string[] | undefined): string {
  if (!path) return "/board";
  const p = Array.isArray(path) ? path[0] : path;
  return p && p.startsWith("/") ? p : "/board";
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const redirect = getRedirect(params.redirect);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--sep)] bg-[var(--surface-1)] p-8 shadow-lg">
        <h1 className="text-xl font-semibold text-[var(--text)]">
          Вход в Pulsar
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Вы будете перенаправлены на общую авторизацию TesterHub. Войдите или
          зарегистрируйтесь там — после этого вы вернётесь сюда.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <SignInButton redirect={redirect} />
          <Link
            href="/board"
            className="text-center text-sm text-[var(--muted)] underline hover:text-[var(--text)]"
          >
            Вернуться на доску
          </Link>
        </div>
      </div>
    </div>
  );
}
