"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";
import { changeReleaseIssuesAction, searchReleaseIssuesAction } from "@/server/actions/releases";
import { buildProjectIssueDetailPath } from "@/shared/projectKeyRoutes";
import type { ReleaseIssue } from "@/shared/releases";
import FormDialog from "@/components/ui/FormDialog";

export default function ReleaseIssues({
  projectId, projectKey, releaseId, issues, candidates,
}: {
  projectId: string;
  projectKey: string;
  releaseId: string;
  issues: ReleaseIssue[];
  candidates: { items: Pick<ReleaseIssue, "id" | "key" | "title">[]; hasMore: boolean } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const term = search.trim();
  const [result, setResult] = useState<{ term: string; data: Awaited<ReturnType<typeof searchReleaseIssuesAction>> } | null>(null);
  const searchResult = term && result?.term === term ? result.data : null;
  const loading = Boolean(term && !searchResult);
  const visible = (term ? (searchResult?.ok ? searchResult.items : []) : candidates?.items) ?? [];
  const hasMore = term ? searchResult?.ok && searchResult.hasMore : candidates?.hasMore;

  useEffect(() => {
    if (!open || !term) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      const data = await searchReleaseIssuesAction(projectId, term)
        .catch(() => ({ ok: false as const, formError: "Не удалось загрузить результаты поиска." }));
      if (active) setResult({ term, data });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, projectId, term]);

  const changeIssues = (operation: "add" | "remove", issueIds: string[]) => {
    setError(null);
    startTransition(async () => {
      const result = await changeReleaseIssuesAction({ projectId, releaseId, operation, issueIds });
      if (!result.ok) {
        if (isAuthRequiredError(result)) showAuthRequiredToast();
        setError(result.formError);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  const addIssues = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    changeIssues("add", [...selected]);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium">Задачи · {issues.length}</h2>
        {candidates ? (
          <Button onClick={() => {
            setError(null);
            setSearch("");
            setResult(null);
            setSelected(new Set());
            setOpen(true);
          }} disabled={pending}>
            Добавить задачи
          </Button>
        ) : null}
      </div>
      {issues.length ? (
        <ul className="divide-y divide-[var(--color-card-border)] border-y border-[var(--color-card-border)]">
          {issues.map((issue) => (
            <li key={issue.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0 break-words text-sm">
                <span className="mr-2 font-mono text-xs text-[var(--muted)]">{issue.key}</span>
                {issue.archived ? (
                  <span>{issue.title} <span className="text-[var(--muted)]">· В корзине</span></span>
                ) : (
                  <Link className="hover:underline" href={buildProjectIssueDetailPath(projectKey, issue.key)}>
                    {issue.title}
                  </Link>
                )}
              </div>
              {candidates ? (
                <Button
                  variant="ghost"
                  aria-label={`Убрать ${issue.key} из релиза`}
                  onClick={() => changeIssues("remove", [issue.id])}
                  disabled={pending}
                >
                  Убрать
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-[var(--muted)]">В релизе пока нет задач.</p>}
      {error && !open ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
      {open ? (
        <FormDialog
          title="Добавить задачи в релиз"
          submitLabel={selected.size ? `Добавить (${selected.size})` : "Добавить"}
          pending={pending}
          disabled={!selected.size}
          error={error}
          onClose={() => {
            setOpen(false);
            setError(null);
          }}
          onSubmit={addIssues}
        >
          <Input
            aria-label="Найти задачу"
            placeholder="Название или ключ задачи"
            value={search}
            maxLength={120}
            onChange={(event) => setSearch(event.target.value)}
            data-autofocus
          />
          {loading ? <p role="status" className="text-sm text-[var(--muted)]">Поиск задач…</p>
          : searchResult && !searchResult.ok ? <p role="alert" className="text-sm text-rose-300">{searchResult.formError}</p>
          : visible.length ? (
            <ul className="max-h-[40vh] divide-y divide-[var(--color-card-border)] overflow-y-auto">
              {visible.map((issue) => (
                <li key={issue.id}>
                  <label className="flex cursor-pointer items-center gap-2 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-cyan-400"
                      checked={selected.has(issue.id)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelected((current) => {
                          const next = new Set(current);
                          if (checked) next.add(issue.id);
                          else next.delete(issue.id);
                          return next;
                        });
                      }}
                    />
                    <span><span className="mr-2 font-mono text-xs text-[var(--muted)]">{issue.key}</span>{issue.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              {term ? "Задачи не найдены." : "В проекте нет свободных задач."}
            </p>
          )}
          {hasMore ? <p className="text-xs text-[var(--muted)]">Показаны первые 50. Чтобы найти другие задачи, уточните поиск.</p> : null}
        </FormDialog>
      ) : null}
    </section>
  );
}
