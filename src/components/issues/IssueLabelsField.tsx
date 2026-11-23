"use client";

import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";
import { searchTaskLabelsAction, updateTaskFieldsAction } from "@/server/actions/tasks";

const chipClass = "max-w-full truncate rounded-md border border-white/8 bg-white/3 px-2 py-0.5 text-[11px] text-white/75";

export default function IssueLabelsField({ issueId, projectId, tags, canEdit }: {
  issueId: string;
  projectId: string;
  tags: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const editorId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{ term: string; labels: string[] | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useOptimistic(tags);
  const term = query.trim().replace(/\s+/g, " ").toLowerCase();
  const selectedNames = new Set(selected.map((tag) => tag.toLowerCase()));
  const result = search?.term === term ? search : null;
  const matches = (result?.labels ?? []).filter((label) => !selectedNames.has(label.toLowerCase()));
  const canCreate = term.length > 0 && !selectedNames.has(term) &&
    !result?.labels?.some((label) => label.toLowerCase() === term);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      const response = await searchTaskLabelsAction(projectId, term).catch(() => null);
      if (active) setSearch({ term, labels: response?.ok ? response.labels : null });
    }, term ? 180 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, projectId, term]);

  function save(next: string[], clearQuery = false) {
    if (pending) return;
    input.current?.focus();
    if (next.length > 20) {
      setError("В задаче может быть до 20 лейблов.");
      return;
    }
    setError(null);
    if (clearQuery) setQuery("");
    startTransition(async () => {
      setSelected(next);
      const result = await updateTaskFieldsAction({ id: issueId, tags: next }).catch(() => null);
      if (!result?.ok) {
        if (isAuthRequiredError(result)) showAuthRequiredToast();
        setError(result?.formError ?? "Не удалось сохранить лейблы.");
        return;
      }
      router.refresh();
    });
  }

  const add = (label: string) => {
    if (label && !selectedNames.has(label.toLowerCase())) save([...selected, label], true);
  };
  const name = (
    <span className="flex shrink-0 items-center gap-2 text-white/60">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M20 12V4H4v8l8 8 8-8Z" />
      </svg>
      Лейблы
    </span>
  );
  const values = (
    <span className="flex min-w-0 flex-wrap justify-end gap-1.5">
      {selected.length ? selected.map((tag) => <span key={tag} title={tag} className={chipClass}>{tag}</span>)
        : <span className="text-sm text-white/45">Без лейблов</span>}
    </span>
  );

  return (
    <div className="order-4 rounded-lg" onBlur={(event) => {
      if (open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        trigger.current?.focus();
      }
    }}>
      {canEdit ? (
        <button ref={trigger} type="button" aria-label="Лейблы" aria-expanded={open}
          aria-controls={open ? editorId : undefined}
          className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-cyan-400/60"
          onClick={() => {
            if (!open) { setQuery(""); setError(null); }
            setOpen(!open);
          }}>
          {name}{open ? null : values}
        </button>
      ) : <div className="flex items-center justify-between gap-3 px-2 py-2">{name}{values}</div>}
      {open && canEdit ? (
        <div id={editorId} className="space-y-2 px-2 pb-2" aria-busy={pending}>
          <Input ref={input} value={query} maxLength={60} aria-label="Найти или создать лейбл"
            placeholder="Найти или создать лейбл" autoComplete="off"
            className="w-full text-xs" onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(matches.find((label) => label.toLowerCase() === term) ?? term);
              }
              if (event.key === "ArrowDown") {
                const option = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>("[data-label-option]:not(:disabled)");
                if (option) { event.preventDefault(); option.focus(); }
              }
            }} />
          {selected.length ? (
            <div className="flex flex-wrap gap-1">
              {selected.map((tag) => (
                <button type="button" key={tag} disabled={pending} aria-label={`Убрать лейбл ${tag}`}
                  className={`${chipClass} hover:bg-white/10`}
                  onClick={() => save(selected.filter((label) => label !== tag))}>
                  {tag} <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          ) : null}
          {matches.length || canCreate ? (
            <ul className="max-h-36 space-y-0.5 overflow-auto">
              {matches.map((label) => (
                <li key={label}>
                  <button type="button" data-label-option disabled={pending} onClick={() => add(label)}
                    className="w-full truncate rounded-md px-2 py-1.5 text-left text-[var(--text)] hover:bg-white/10">
                    {label}
                  </button>
                </li>
              ))}
              {canCreate ? (
                <li>
                  <button type="button" data-label-option disabled={pending} onClick={() => add(term)}
                    className="w-full break-words rounded-md px-2 py-1.5 text-left text-[var(--text)] hover:bg-white/10">
                    Создать «{term}»
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
          {result && !result.labels ? <p role="status" className="text-[var(--muted)]">Лейблы не загрузились.</p> : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="px-2 pb-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
