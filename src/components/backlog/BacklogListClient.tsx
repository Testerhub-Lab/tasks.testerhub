"use client";

import React, { useState, useTransition } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Priority, Status } from "@prisma/client";
import { moveBacklogTasksToTodoAction } from "../../server/actions/tasks";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";
import BacklogRowClient from "../issues/BacklogRowClient";
import { buildIssueDetailHref } from "@/shared/issueNavigation";
import { buildProjectReleasesPath } from "@/shared/projectKeyRoutes";
import { releaseStatusLabels, type ReleaseOption } from "@/shared/releases";
import { changeReleaseIssuesAction } from "@/server/actions/releases";
import FormDialog from "@/components/ui/FormDialog";
import MenuSelect from "@/components/ui/MenuSelect";

type BacklogTask = {
  id: string;
  projectId: string;
  project?: { key: string } | null;
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
  releaseLinks,
  releaseProject,
}: {
  tasks: BacklogTask[];
  releaseLinks: Record<string, { id: string; title: string }>;
  releaseProject: { id: string; key: string; options: ReleaseOption[] } | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [releasePickerOpen, setReleasePickerOpen] = useState(false);
  const [releaseId, setReleaseId] = useState("");
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

  const openReleasePicker = () => {
    if ([...selectedIds].some((id) => releaseLinks[id])) {
      setErrorMessage("Снимите выделение с задач, которые уже входят в релиз.");
      return;
    }
    setErrorMessage(null);
    setReleaseId("");
    setReleasePickerOpen(true);
  };

  const addToRelease = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!releaseProject || !releaseId) return;
    setErrorMessage(null);
    startTransition(async () => {
      const result = await changeReleaseIssuesAction({
        projectId: releaseProject.id,
        releaseId,
        issueIds: [...selectedIds],
        operation: "add",
      });
      if (!result.ok) {
        if (isAuthRequiredError(result)) showAuthRequiredToast();
        setErrorMessage(result.formError);
        return;
      }
      setReleasePickerOpen(false);
      setSelectedIds(new Set());
      router.refresh();
    });
  };

  return (
    <>
      <div
        className={`transition-opacity ${
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
            href={buildIssueDetailHref(task.key ?? task.id, searchParams, {
              projectId: task.projectId,
              projectKey: task.project?.key ?? null,
              from: "backlog",
            })}
            release={task.project && releaseLinks[task.id] ? {
              title: releaseLinks[task.id].title,
              href: buildProjectReleasesPath(task.project.key, releaseLinks[task.id].id),
            } : null}
            selected={selectedIds.has(task.id)}
            selectionActive={selectedCount > 0}
            onSelectionChange={(selected) => setSelected(task.id, selected)}
            onRemoved={() => removeLocally(task.id)}
          />
        ))}
      </div>

      {selectedCount > 0 ? (
        <div
          className="fixed bottom-6 left-[calc(50%+115px)] z-40 flex min-h-11 w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg border border-white/10 bg-[var(--surface-popover)] px-2.5 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl max-lg:left-1/2"
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

          {releaseProject ? (
            <button
              type="button"
              onClick={openReleasePicker}
              disabled={isPending}
              className="h-7 whitespace-nowrap rounded-sm px-2 text-xs text-cyan-100/90 transition-colors hover:bg-cyan-400/12 disabled:opacity-50"
            >
              В релиз
            </button>
          ) : null}

          <button
            type="button"
            onClick={clearSelection}
            disabled={isPending}
            className="h-7 rounded-sm px-2 text-xs text-white/45 transition-colors hover:bg-white/5 hover:text-white/75 disabled:opacity-50"
          >
            Clear
          </button>

          {errorMessage && !releasePickerOpen ? (
            <span role="alert" className="max-w-64 px-1 text-xs text-rose-300">
              {errorMessage}
            </span>
          ) : null}
        </div>
      ) : null}
      {releasePickerOpen && releaseProject ? (
        <FormDialog
          title="Добавить в релиз"
          submitLabel="Добавить"
          pending={isPending}
          disabled={!releaseId}
          error={errorMessage}
          onClose={() => {
            setErrorMessage(null);
            setReleasePickerOpen(false);
          }}
          onSubmit={addToRelease}
        >
          {releaseProject.options.length ? (
            <>
              <p className="text-sm text-[var(--muted)]">Выбрано задач: {selectedCount}</p>
              <div className="grid gap-1 text-sm">
                <span>Релиз проекта</span>
                <MenuSelect
                  ariaLabel="Релиз проекта"
                  value={releaseId}
                  onChange={setReleaseId}
                  options={[
                    { value: "", label: "Выберите релиз" },
                    ...releaseProject.options.map((release) => ({
                      value: release.id,
                      label: `${release.title} · ${releaseStatusLabels[release.status]}`,
                    })),
                  ]}
                />
              </div>
            </>
          ) : (
            <p className="text-sm">
              Нет открытых релизов. Создайте черновик в разделе{" "}
              <Link className="underline" href={buildProjectReleasesPath(releaseProject.key)}>«Релизы»</Link>.
            </p>
          )}
        </FormDialog>
      ) : null}
    </>
  );
}
