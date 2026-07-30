"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Priority, Status } from "@prisma/client";
import { moveBacklogTasksToTodoAction } from "../../server/actions/tasks";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";
import BacklogRowClient from "../issues/BacklogRowClient";

type BacklogTask = {
  id: string;
  title: string;
  key: string | null;
  type: string | null;
  priority: Priority;
  status: Status;
  createdAt: Date;
  reporter: { name: string | null; email: string | null } | null;
  requesterName: string | null;
};

export default function BacklogListClient({
  tasks,
}: {
  tasks: BacklogTask[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleTasks = tasks.filter((task) => !hiddenIds.has(task.id));
  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    visibleTasks.length > 0 &&
    visibleTasks.every((task) => selectedIds.has(task.id));

  const setSelected = (taskId: string, selected: boolean) => {
    setErrorMessage(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  };

  const removeLocally = (taskId: string) => {
    setHiddenIds((current) => new Set(current).add(taskId));
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(taskId);
      return next;
    });
  };

  const selectVisible = () => {
    setErrorMessage(null);
    setSelectedIds(new Set(visibleTasks.map((task) => task.id)));
  };

  const clearSelection = () => {
    setErrorMessage(null);
    setSelectedIds(new Set());
  };

  const moveSelectedToTodo = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    setErrorMessage(null);
    startTransition(async () => {
      const result = await moveBacklogTasksToTodoAction({ ids });
      if (!result.ok) {
        if (isAuthRequiredError({ formError: result.formError ?? null })) {
          showAuthRequiredToast();
          return;
        }
        setErrorMessage(
          result.formError ?? "Не удалось переместить выбранные задачи."
        );
        return;
      }

      setHiddenIds((current) => new Set([...current, ...ids]));
      setSelectedIds(new Set());
      router.refresh();
    });
  };

  return (
    <>
      <div
        className={`space-y-4 transition-opacity ${
          isPending ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {visibleTasks.map((task) => (
          <BacklogRowClient
            key={task.id}
            id={task.id}
            title={task.title}
            issueKey={task.key}
            type={task.type}
            priority={task.priority}
            status={task.status}
            createdAt={task.createdAt}
            reporter={task.reporter}
            requesterName={task.requesterName}
            href={`/tasks/${task.key ?? task.id}`}
            selected={selectedIds.has(task.id)}
            selectionActive={selectedCount > 0}
            onSelectionChange={(selected) => setSelected(task.id, selected)}
            onRemoved={() => removeLocally(task.id)}
          />
        ))}
      </div>

      {selectedCount > 0 ? (
        <div
          className="fixed bottom-6 left-[calc(50%+115px)] z-40 flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/95 px-2.5 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl max-lg:left-1/2"
          role="toolbar"
          aria-label="Bulk backlog actions"
        >
          <span className="px-1 text-xs font-medium text-white/70">
            {selectedCount} selected
          </span>

          {!allVisibleSelected ? (
            <button
              type="button"
              onClick={selectVisible}
              disabled={isPending}
              className="h-7 rounded-sm px-2 text-xs text-white/50 transition-colors hover:bg-white/5 hover:text-white/80 disabled:opacity-50"
            >
              Select page
            </button>
          ) : null}

          <button
            type="button"
            onClick={moveSelectedToTodo}
            disabled={isPending}
            className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-cyan-400/12 px-2.5 text-xs font-medium text-cyan-100/90 transition-colors hover:bg-cyan-400/18 disabled:opacity-50"
          >
            {isPending ? (
              <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white/80" />
            ) : (
              <span aria-hidden="true">↗</span>
            )}
            Move to Todo
          </button>

          <button
            type="button"
            onClick={clearSelection}
            disabled={isPending}
            className="h-7 rounded-sm px-2 text-xs text-white/45 transition-colors hover:bg-white/5 hover:text-white/75 disabled:opacity-50"
          >
            Clear
          </button>

          {errorMessage ? (
            <span className="max-w-64 truncate px-1 text-xs text-rose-300">
              {errorMessage}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
