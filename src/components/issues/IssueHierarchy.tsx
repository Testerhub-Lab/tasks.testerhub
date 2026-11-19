"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CreateTaskModal from "../modals/CreateTaskModal";
import { addTaskToEpicAction, searchEpicTasksAction } from "@/server/actions/tasks";
import type { RelatedIssue } from "@/server/queries/issueHierarchy";
import { buildIssueDetailHref } from "@/shared/issueNavigation";
import { TASK_STATUS_LABEL } from "@/shared/taskEnums";

type Props = {
  task: { id: string; key: string; type: string };
  project: { id: string; key: string; name: string };
  hierarchy: { parent?: RelatedIssue; children: RelatedIssue[] };
  users: { id: string; name: string | null; email: string }[];
  canEdit: boolean;
};

export default function IssueHierarchy({ task, project, hierarchy, users, canEdit }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<RelatedIssue[] | null>(null);
  const [error, setError] = useState("");
  const [saving, startTransition] = useTransition();
  const isEpic = task.type.toUpperCase() === "EPIC";
  const href = (issue: RelatedIssue) => buildIssueDetailHref(issue.key, searchParams, { projectKey: project.key });

  useEffect(() => {
    if (!picking) return;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const rows = await searchEpicTasksAction(project.id, query);
        if (current) setMatches(rows);
      } catch {
        if (current) setError("Не удалось загрузить задачи.");
      }
    }, 180);
    return () => { current = false; clearTimeout(timer); };
  }, [project.id, query, picking]);

  function attach(issue: RelatedIssue) {
    setError("");
    startTransition(async () => {
      try {
        const result = await addTaskToEpicAction(project.id, task.id, issue.id);
        if (result.error) { setError(result.error); return; }
        setPicking(false);
        router.refresh();
      } catch {
        setError("Не удалось добавить задачу в эпик.");
      }
    });
  }

  if (!canEdit && !hierarchy.parent && !hierarchy.children.length) return null;
  return <section className="space-y-3 border-t border-white/[0.07] pt-5" aria-label="Иерархия задач">
    {hierarchy.parent && <p className="text-sm text-white/60">
      {hierarchy.parent.type.toUpperCase() === "EPIC" ? "Эпик" : "Родительская задача"} ·{" "}
      <Link className="text-cyan-300 hover:underline" href={href(hierarchy.parent)}>
        {hierarchy.parent.key} {hierarchy.parent.title}
      </Link>
    </p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-medium">{isEpic ? "Задачи эпика" : "Подзадачи"} · {hierarchy.children.length}</h2>
      {canEdit && <div className="flex flex-wrap gap-2">
        <button type="button" className="button" onClick={() => setCreating(true)}>
          {isEpic ? "Создать задачу" : "Создать подзадачу"}
        </button>
        {isEpic && <button type="button" className="button" aria-expanded={picking} onClick={() => {
          setPicking(!picking); setQuery(""); setMatches(null); setError("");
        }}>Добавить существующую</button>}
      </div>}
    </div>
    {picking && <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <input autoFocus className="input w-full" aria-label="Найти задачу" placeholder="Ключ или название задачи"
        maxLength={120} value={query} onChange={event => {
          setQuery(event.target.value); setMatches(null); setError("");
        }} />
      {error && <p role="alert">{error}</p>}
      {!error && !matches && <p role="status">Поиск…</p>}
      {matches?.length === 0 && <p role="status">Нет подходящих задач.</p>}
      <ul className="max-h-64 overflow-y-auto">{matches?.map(issue => <li key={issue.id}>
        <button type="button" disabled={saving} onClick={() => attach(issue)}
          className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-white/5 focus-visible:underline">
          {issue.key} · {issue.title}
        </button>
      </li>)}</ul>
    </div>}
    <ul className="divide-y divide-white/10">{hierarchy.children.map(issue => <li key={issue.id}>
      <Link className="flex items-baseline justify-between gap-3 py-2 text-sm hover:underline" href={href(issue)}>
        <span>{issue.key} · {issue.title}</span><span className="shrink-0 text-white/55">{TASK_STATUS_LABEL[issue.status]}</span>
      </Link>
    </li>)}</ul>
    {creating && <CreateTaskModal isOpen onClose={() => setCreating(false)} projects={[project]} users={users}
      parent={{ id: task.id, key: task.key, isEpic }} />}
  </section>;
}
