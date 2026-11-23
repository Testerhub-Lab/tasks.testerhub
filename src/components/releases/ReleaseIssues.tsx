"use client";

import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, rectIntersection,
  useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent,
} from "@dnd-kit/core";
import { useEffect, useId, useOptimistic, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import MenuSelect from "@/components/ui/MenuSelect";
import IssueTypeBadge from "@/components/issues/IssueTypeBadge";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";
import { changeReleaseIssuesAction, searchReleaseIssuesAction } from "@/server/actions/releases";
import { buildProjectIssueDetailPath } from "@/shared/projectKeyRoutes";
import {
  DEFAULT_RELEASE_ISSUE_STATUS_FILTER, RELEASE_ISSUE_STATUS_FILTERS, type ReleaseIssue, type ReleaseIssueStatusFilter,
} from "@/shared/releases";
import { TASK_STATUS_LABEL } from "@/shared/taskEnums";

type Column = "available" | "included";
type Move = { issue: ReleaseIssue; from: Column };
type CandidatePage = { items: ReleaseIssue[]; hasMore: boolean };

const statusOptions = RELEASE_ISSUE_STATUS_FILTERS.map((value) => ({
  value,
  label: value === "open" ? "Открытые задачи"
    : value === "all" ? "Все статусы"
    : value === "NEW" ? "Только бэклог" : TASK_STATUS_LABEL[value],
}));

const collisionDetection: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);

function IssueTitle({ issue, projectKey }: { issue: ReleaseIssue; projectKey: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <IssueTypeBadge type={issue.type} />
        <span className="font-mono text-[11px] text-[var(--muted)]">{issue.key}</span>
        <span className="text-[11px] text-[var(--muted)]">{issue.archived ? "В корзине" : TASK_STATUS_LABEL[issue.status]}</span>
      </div>
      {issue.archived ? <p className="break-words text-sm">{issue.title}</p> : (
        <Link prefetch={false} className="block break-words text-sm font-medium hover:underline"
          href={buildProjectIssueDetailPath(projectKey, issue.key)}>{issue.title}</Link>
      )}
    </div>
  );
}

function MovableIssue({ issue, from, projectKey, pending, onMove, selected, onSelect }: Move & {
  projectKey: string;
  pending: boolean;
  onMove: (move: Move) => void;
  selected?: boolean;
  onSelect?: (issue: ReleaseIssue, checked: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: issue.id,
    data: { issue, from },
    disabled: pending || issue.archived || selected !== undefined,
  });
  const action = from === "available" ? `Добавить ${issue.key} в релиз` : `Убрать ${issue.key} из релиза`;

  return (
    <li ref={setNodeRef}
      className={`flex items-center gap-2 rounded-lg border border-[var(--sep)] bg-[var(--control-bg)] p-2 ${isDragging ? "opacity-40" : ""}`}>
      {selected !== undefined ? (
        <input type="checkbox" checked={selected} disabled={pending} aria-label={`Выбрать ${issue.key}`}
          className="ml-2 size-4 shrink-0 accent-cyan-400" onChange={(event) => onSelect?.(issue, event.target.checked)} />
      ) : !issue.archived ? (
        <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
          aria-label={`Перетащить ${issue.key}`}
          className="flex size-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-[var(--muted)] hover:bg-white/5 active:cursor-grabbing"
          disabled={pending}>
          <svg aria-hidden="true" width="14" height="16" viewBox="0 0 14 16" fill="currentColor">
            <circle cx="4" cy="3" r="1" /><circle cx="10" cy="3" r="1" />
            <circle cx="4" cy="8" r="1" /><circle cx="10" cy="8" r="1" />
            <circle cx="4" cy="13" r="1" /><circle cx="10" cy="13" r="1" />
          </svg>
        </button>
      ) : null}
      <IssueTitle issue={issue} projectKey={projectKey} />
      {selected === undefined ? (
        <Button variant="ghost" aria-label={action} title={action} disabled={pending}
          className="shrink-0" onClick={() => onMove({ issue, from })}>
          {from === "available" ? "Добавить" : "Убрать"}
        </Button>
      ) : null}
    </li>
  );
}

function ReleaseColumn({ id, title, children, controls }: {
  id: Column;
  title: string;
  children: ReactNode;
  controls?: ReactNode;
}) {
  const { active, setNodeRef, isOver } = useDroppable({ id });
  const isTarget = isOver && active?.data.current?.from !== id;
  return (
    <Card ref={setNodeRef} variant="surface" padding="none" role="region" aria-label={title}
      className={`min-h-48 min-w-0 rounded-xl border transition-colors ${isTarget ? "border-cyan-400/55 bg-cyan-400/5" : "border-[var(--sep)]"}`}>
      <header className="space-y-2 border-b border-[var(--sep)] px-3 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {controls}
      </header>
      {children}
    </Card>
  );
}

export default function ReleaseIssues({ projectId, projectKey, releaseId, issues, candidates }: {
  projectId: string;
  projectKey: string;
  releaseId: string;
  issues: ReleaseIssue[];
  candidates: CandidatePage | null;
}) {
  const router = useRouter();
  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const [dragged, setDragged] = useState<Move | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Map<string, ReleaseIssue> | null>(null);
  const [pending, startTransition] = useTransition();
  const [included, updateIncluded] = useOptimistic(issues, (current, move: { issues: ReleaseIssue[]; from: Column }) => {
    if (move.from === "included") return current.filter(({ id }) => id !== move.issues[0].id);
    const existingIds = new Set(current.map(({ id }) => id));
    return [...current, ...move.issues.filter(({ id }) => !existingIds.has(id))];
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReleaseIssueStatusFilter>(DEFAULT_RELEASE_ISSUE_STATUS_FILTER);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: Awaited<ReturnType<typeof searchReleaseIssuesAction>> } | null>(null);
  const term = search.trim();
  const defaultPage = !term && status === DEFAULT_RELEASE_ISSUE_STATUS_FILTER && page === 0;
  const queryKey = JSON.stringify([term, status, page, revision]);
  const fetched = result?.key === queryKey ? result.data : null;
  const availablePage = defaultPage ? candidates : fetched?.ok ? fetched : null;
  const includedIds = new Set(included.map(({ id }) => id));
  const available = availablePage?.items.filter(({ id }) => !includedIds.has(id)) ?? [];
  const canEdit = candidates !== null;

  useEffect(() => {
    if (!canEdit || defaultPage) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      const response = await searchReleaseIssuesAction(projectId, term, status, page)
        .catch(() => ({ ok: false as const, formError: "Не удалось загрузить задачи." }));
      if (active) {
        setResult({ key: queryKey, data: response });
        if (response.ok && !response.items.length && page > 0) setPage(page - 1);
      }
    }, term ? 180 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canEdit, defaultPage, page, projectId, queryKey, status, term]);

  function moveIssues(items: ReleaseIssue[], from: Column) {
    if (pending || !canEdit || !items.length) return;
    setError(null);
    startTransition(async () => {
      updateIncluded({ issues: items, from });
      const response = await changeReleaseIssuesAction({
        projectId,
        releaseId,
        operation: from === "available" ? "add" : "remove",
        issueIds: items.map(({ id }) => id),
      }).catch(() => null);
      if (!response?.ok) {
        if (isAuthRequiredError(response)) showAuthRequiredToast();
        setError(response?.formError ?? "Не удалось изменить состав релиза.");
      } else if (from === "available") {
        setSelection(null);
      }
      setRevision((current) => current + 1);
      router.refresh();
    });
  }

  function moveIssue({ issue, from }: Move) {
    moveIssues([issue], from);
  }

  function selectIssue(issue: ReleaseIssue, checked: boolean) {
    if (!selection) return;
    const next = new Map(selection);
    if (checked) next.set(issue.id, issue);
    else next.delete(issue.id);
    setSelection(next);
  }

  function endDrag({ active, over }: DragEndEvent) {
    const move = active.data.current as Move | undefined;
    setDragged(null);
    const target = move?.from === "available" ? "included" : "available";
    if (move && over?.id === target) moveIssue(move);
  }

  if (!canEdit) {
    return (
      <section className="space-y-3">
        <h2 className="text-base font-medium">Задачи · {issues.length}</h2>
        {issues.length ? (
          <ul className="divide-y divide-[var(--sep)] border-y border-[var(--sep)]">
            {issues.map((issue) => <li key={issue.id} className="py-2"><IssueTitle issue={issue} projectKey={projectKey} /></li>)}
          </ul>
        ) : <p className="text-sm text-[var(--muted)]">В релизе пока нет задач.</p>}
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label="Состав релиза">
      <DndContext id={dndId} sensors={sensors} collisionDetection={collisionDetection}
        onDragStart={({ active }) => setDragged((active.data.current as Move) ?? null)}
        onDragCancel={() => setDragged(null)}
        onDragEnd={endDrag}>
        <div className="grid gap-3 lg:grid-cols-2">
          <ReleaseColumn id="available" title="Доступные задачи" controls={
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input aria-label="Найти задачу" className="min-w-32 flex-1" placeholder="Название или ключ"
                  maxLength={120} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
                <MenuSelect ariaLabel="Статус задач" value={status} onChange={(value) => { setStatus(value); setPage(0); }}
                  options={statusOptions} />
                <Button variant="ghost" disabled={pending} onClick={() => setSelection(selection ? null : new Map())}>
                  {selection ? "Отменить выбор" : "Выбрать несколько"}
                </Button>
              </div>
              {selection ? (
                <Button variant="secondary" disabled={!selection.size || pending}
                  onClick={() => moveIssues([...selection.values()], "available")}>
                  Добавить выбранные ({selection.size})
                </Button>
              ) : null}
            </>
          }>
            {available.length ? (
              <ul className="max-h-[58vh] space-y-2 overflow-y-auto p-3">
                {available.map((issue) => (
                  <MovableIssue key={issue.id} issue={issue} projectKey={projectKey} from="available" pending={pending}
                    onMove={moveIssue} selected={selection?.has(issue.id)} onSelect={selectIssue} />
                ))}
              </ul>
            ) : (
              <p className="px-3 py-4 text-sm text-[var(--muted)]" role={fetched && !fetched.ok ? "alert" : "status"}>
                {fetched && !fetched.ok ? fetched.formError : !availablePage ? "Загружаем задачи…"
                  : term ? "Задачи не найдены." : "Нет доступных задач."}
              </p>
            )}
            {page > 0 || availablePage?.hasMore ? (
              <div className="flex justify-between gap-2 border-t border-[var(--sep)] px-3 py-1 text-xs">
                <Button variant="ghost" disabled={page === 0 || pending} onClick={() => setPage(page - 1)}>Назад</Button>
                <Button variant="ghost" disabled={!availablePage?.hasMore || pending} onClick={() => setPage(page + 1)}>Ещё задачи</Button>
              </div>
            ) : null}
          </ReleaseColumn>
          <ReleaseColumn id="included" title={`В релизе · ${included.length}`}>
            {included.length ? (
              <ul className="max-h-[58vh] space-y-2 overflow-y-auto p-3">
                {included.map((issue) => (
                  <MovableIssue key={issue.id} issue={issue} projectKey={projectKey} from="included" pending={pending} onMove={moveIssue} />
                ))}
              </ul>
            ) : <p className="px-3 py-4 text-sm text-[var(--muted)]">Перетащите сюда задачи, чтобы добавить их в релиз.</p>}
          </ReleaseColumn>
        </div>
        <DragOverlay dropAnimation={null}>
          {dragged ? (
            <div inert className="cursor-grabbing rounded-lg border border-cyan-400/40 bg-[var(--surface-popover)] p-3 shadow-xl">
              <IssueTitle issue={dragged.issue} projectKey={projectKey} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
