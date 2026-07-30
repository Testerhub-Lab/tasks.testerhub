"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  defaultDropAnimation,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import IssueCard from "./IssueCard";
import BoardColumn from "./BoardColumn";
import { updateTaskFieldsAction, updateTaskStatusAction } from "../../server/actions/tasks";
import { useRouter } from "next/navigation";
import type { TaskStatus } from "../../server/validators/task";
import { Priority } from "@prisma/client";
import type { UserOption } from "../../server/queries/users";
import { useBoardRealtime } from "@/hooks/useBoardRealtime";
import type { RealtimeEvent } from "@/types/realtime";

type Status = TaskStatus;
type BoardColumnStatus = "TODO" | "IN_PROGRESS" | "TESTING" | "DONE";

type BoardTask = {
  id: string;
  projectId: string;
  key: string | null;
  title: string;
  type: string | null;
  description: string | null;
  priority: Priority;
  status: Status;
  createdAt?: string | Date | null;
  assignee: { id: string; name: string | null; email: string | null } | null;
  reporter: { name: string | null; email: string | null } | null;
  requesterName: string | null;
};

const columns: { status: BoardColumnStatus; title: string }[] = [
  { status: "TODO", title: "Todo" },
  { status: "IN_PROGRESS", title: "In progress" },
  { status: "TESTING", title: "Testing" },
  { status: "DONE", title: "Done" },
];

const hiddenColumnTone: Record<BoardColumnStatus, string> = {
  TODO: "border-white/35",
  IN_PROGRESS: "border-amber-400",
  TESTING: "border-cyan-400",
  DONE: "border-emerald-400",
};

type BoardColumnMeta = {
  status: BoardColumnStatus;
  totalCount: number;
  hasMore: boolean;
  loadMoreHref: string | null;
};

interface BoardClientProps {
  tasks: BoardTask[];
  columns: BoardColumnMeta[];
  users: UserOption[];
  boardId?: string | null;
  editableProjectIds?: string[];
}

const BoardClient: React.FC<BoardClientProps> = ({
  tasks,
  columns: columnMeta,
  users,
  boardId = null,
  editableProjectIds = [],
}) => {
  const router = useRouter();
  const [isMounted, setMounted] = useState(false);
  const [items, setItems] = useState<BoardTask[]>(tasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [savingMove, setSavingMove] = useState<{
    id: string;
    to: Status;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingAssignee, setSavingAssignee] = useState<string | null>(null);
  const [dndSyncKey, setDndSyncKey] = useState(0);
  const [revealedEmptyStatuses, setRevealedEmptyStatuses] = useState<
    BoardColumnStatus[]
  >([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setItems(tasks);
  }, [tasks]);

  useEffect(() => {
    setDndSyncKey((prev) => prev + 1);
  }, [tasks]);

  const effectiveBoardId = useMemo(() => boardId ?? null, [boardId]);
  const editableProjectIdSet = useMemo(
    () => new Set(editableProjectIds),
    [editableProjectIds]
  );

  const applyRealtimeEvent = React.useCallback(
    (event: RealtimeEvent) => {
      setItems((prev) => {
        if (event.type === "task_deleted") {
          return prev.filter((task) => task.id !== event.payload.taskId);
        }

        if (event.type === "task_restored") {
          const restoredTask = event.payload.task;
          if (!restoredTask) return prev;

          const assignee =
            restoredTask.assigneeId !== null
              ? users.find((user) => user.id === restoredTask.assigneeId) ?? null
              : null;
          const mappedTask: BoardTask = {
            id: restoredTask.id,
            projectId: restoredTask.projectId,
            key: restoredTask.key,
            title: restoredTask.title,
            type: restoredTask.type,
            description: restoredTask.description,
            priority: restoredTask.priority,
            status: restoredTask.status,
            createdAt: restoredTask.createdAt,
            assignee,
            reporter: null,
            requesterName: restoredTask.requesterName,
          };
          const exists = prev.some((task) => task.id === mappedTask.id);
          if (exists) {
            return prev.map((task) => (task.id === mappedTask.id ? mappedTask : task));
          }
          return [mappedTask, ...prev];
        }

        if (event.type === "task_created") {
          const nextTask = event.payload.task;
          const assignee =
            nextTask.assigneeId !== null
              ? users.find((user) => user.id === nextTask.assigneeId) ?? null
              : null;
          const mappedTask: BoardTask = {
            id: nextTask.id,
            projectId: nextTask.projectId,
            key: nextTask.key,
            title: nextTask.title,
            type: nextTask.type,
            description: nextTask.description,
            priority: nextTask.priority,
            status: nextTask.status,
            createdAt: nextTask.createdAt,
            assignee,
            reporter: null,
            requesterName: nextTask.requesterName,
          };

          const exists = prev.some((task) => task.id === mappedTask.id);
          if (exists) {
            return prev.map((task) => (task.id === mappedTask.id ? { ...task, ...mappedTask } : task));
          }
          return [mappedTask, ...prev];
        }

        if (event.type === "task_updated") {
          const nextTask = event.payload.task;
          return prev.map((task) => {
            if (task.id !== nextTask.id) return task;
            const nextAssignee =
              typeof nextTask.assigneeId !== "undefined"
                ? nextTask.assigneeId !== null
                  ? users.find((user) => user.id === nextTask.assigneeId) ?? null
                  : null
                : task.assignee;

            return {
              ...task,
              key: typeof nextTask.key !== "undefined" ? nextTask.key : task.key,
              title: typeof nextTask.title !== "undefined" ? nextTask.title : task.title,
              type: typeof nextTask.type !== "undefined" ? nextTask.type : task.type,
              description:
                typeof nextTask.description !== "undefined"
                  ? nextTask.description
                  : task.description,
              priority:
                typeof nextTask.priority !== "undefined"
                  ? nextTask.priority
                  : task.priority,
              status:
                typeof nextTask.status !== "undefined"
                  ? (nextTask.status as Status)
                  : task.status,
              createdAt:
                typeof nextTask.createdAt !== "undefined"
                  ? nextTask.createdAt
                  : task.createdAt,
              requesterName:
                typeof nextTask.requesterName !== "undefined"
                  ? nextTask.requesterName
                  : task.requesterName,
              assignee: nextAssignee,
            };
          });
        }

        return prev;
      });
    },
    [users]
  );

  useBoardRealtime({
    boardId: effectiveBoardId,
    enabled: Boolean(effectiveBoardId),
    onEvent: (event) => {
      applyRealtimeEvent(event);
    },
  });

  const cleanupDragState = React.useCallback(() => {
    setIsDragging(false);
    setActiveId(null);
    if (typeof document === "undefined") return;
    document.body.classList.remove("is-dragging");
    document.documentElement.classList.remove("is-dragging");
    document.body.style.cursor = "";
    document.documentElement.style.cursor = "";
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isDragging) {
      document.body.classList.add("is-dragging");
      document.documentElement.classList.add("is-dragging");
      document.body.style.cursor = "grabbing";
      document.documentElement.style.cursor = "grabbing";
    } else {
      document.body.classList.remove("is-dragging");
      document.documentElement.classList.remove("is-dragging");
      document.body.style.cursor = "";
      document.documentElement.style.cursor = "";
    }
  }, [isDragging]);

  useEffect(() => {
    const handleMouseUp = () => cleanupDragState();
    const handleBlur = () => cleanupDragState();
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [cleanupDragState]);

  const grouped = useMemo(() => {
    const map: Record<Status, BoardTask[]> = {
      TODO: [],
      IN_PROGRESS: [],
      TESTING: [],
      DONE: [],
      NEW: [],
      HOLD: [],
      REJECT: []
    };
    for (const t of items) map[t.status]?.push(t);
    return map;
  }, [items]);
  const columnMetaByStatus = useMemo(
    () => new Map(columnMeta.map((column) => [column.status, column])),
    [columnMeta]
  );
  const columnView = useMemo(
    () =>
      columns.map((column) => {
        const loadedCount = grouped[column.status]?.length ?? 0;
        const totalCount =
          columnMetaByStatus.get(column.status)?.totalCount ?? loadedCount;
        return {
          ...column,
          count: Math.max(totalCount, loadedCount),
        };
      }),
    [columnMetaByStatus, grouped]
  );
  const visibleColumns = useMemo(
    () =>
      columnView.filter(
        (column) =>
          isDragging ||
          column.count > 0 ||
          revealedEmptyStatuses.includes(column.status)
      ),
    [columnView, isDragging, revealedEmptyStatuses]
  );
  const hiddenColumns = useMemo(
    () =>
      isDragging
        ? []
        : columnView.filter(
            (column) =>
              column.count === 0 &&
              !revealedEmptyStatuses.includes(column.status)
          ),
    [columnView, isDragging, revealedEmptyStatuses]
  );

  const revealEmptyColumn = React.useCallback((status: BoardColumnStatus) => {
    setRevealedEmptyStatuses((current) =>
      current.includes(status) ? current : [...current, status]
    );
  }, []);

  const hideEmptyColumn = React.useCallback((status: BoardColumnStatus) => {
    setRevealedEmptyStatuses((current) =>
      current.filter((item) => item !== status)
    );
  }, []);

  const dndSignature = useMemo(
    () =>
      items
        .map((task) => `${task.id}:${task.status}:${task.assignee?.id ?? ""}`)
        .join("|"),
    [items]
  );

  useEffect(() => {
    if (!isMounted) return;
    setDndSyncKey((prev) => prev + 1);
  }, [dndSignature, isMounted]);

  const activeTask = useMemo(() => {
    if (!activeId) return null;
    return items.find((t) => t.id === activeId) ?? null;
  }, [activeId, items]);

  const handleDragEnd = async (event: DragEndEvent) => {
    setErrorMessage(null);

    const { active, over } = event;
    if (!over) {
      cleanupDragState();
      return;
    }

    const taskId = String(active.id);
    const to = String(over.id) as Status;

    const task = items.find((t) => t.id === taskId);
    if (!task) return;
    if (!editableProjectIdSet.has(task.projectId)) {
      cleanupDragState();
      return;
    }
    if (task.status === to) return;

    // optimistic UI
    setItems((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: to } : t))
    );

    setSavingMove({ id: taskId, to });

    try {
      const result = await updateTaskStatusAction({ id: taskId, status: to });
      if (!result.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: task.status } : item
          )
        );
        setErrorMessage(result.formError ?? "Не удалось переместить задачу.");
        return;
      }
      router.refresh();
    } catch {
      // rollback
      setItems((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: task.status } : t))
      );
      setErrorMessage("Не удалось переместить задачу. Проверь соединение или попробуй ещё раз.");
    } finally {
      setSavingMove(null);
      cleanupDragState();
    }
  };

  const handleAssigneeChange = async (taskId: string, assigneeId: string | null) => {
    setErrorMessage(null);
    const task = items.find((item) => item.id === taskId);
    if (!task || !editableProjectIdSet.has(task.projectId)) return;
    const previous = items;
    const nextAssignee =
      assigneeId === null
        ? null
        : users.find((u) => u.id === assigneeId) ?? null;

    setItems((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, assignee: nextAssignee } : t
      )
    );
    setSavingAssignee(taskId);
    try {
      const result = await updateTaskFieldsAction({ id: taskId, assigneeId });
      if (!result.ok) {
        setItems(previous);
        setErrorMessage(result.formError ?? "Не удалось обновить исполнителя.");
        return;
      }
      router.refresh();
    } catch {
      setItems(previous);
      setErrorMessage("Не удалось обновить исполнителя.");
    } finally {
      setSavingAssignee(null);
    }
  };

  const columnsMarkup = (
    <div className="flex items-start gap-3 overflow-x-auto pb-3">
      {visibleColumns.map((column) => (
        <div key={column.status} className="w-[328px] shrink-0">
          <BoardColumn
            status={column.status}
            title={column.title}
            count={column.count}
            disabled={!isMounted}
            onHide={
              !isDragging &&
              column.count === 0 &&
              revealedEmptyStatuses.includes(column.status)
                ? () => hideEmptyColumn(column.status)
                : undefined
            }
          >
            {grouped[column.status]?.map((task) =>
              isMounted ? (
                <DraggableIssueCard
                  key={task.id}
                  task={task}
                  isSaving={savingMove?.id === task.id}
                  users={users}
                  onAssigneeChange={handleAssigneeChange}
                  isSavingAssignee={savingAssignee === task.id}
                  canEdit={editableProjectIdSet.has(task.projectId)}
                />
              ) : (
                <IssueCard
                  key={task.id}
                  issueKey={task.key ?? undefined}
                  title={task.title}
                  type={task.type ?? null}
                  description={task.description}
                  priority={task.priority}
                  status={task.status}
                  createdAt={task.createdAt ?? null}
                  assignee={task.assignee}
                  reporter={task.reporter}
                  requesterName={task.requesterName}
                  users={users}
                  onAssigneeChange={(assigneeId) =>
                    handleAssigneeChange(task.id, assigneeId)
                  }
                  isSavingAssignee={savingAssignee === task.id}
                  canEdit={editableProjectIdSet.has(task.projectId)}
                />
              )
            )}
            {(() => {
              const meta = columnMetaByStatus.get(column.status);
              if (!meta?.hasMore || !meta.loadMoreHref) return null;
              const loadedCount = grouped[column.status]?.length ?? 0;
              return (
                <Link
                  href={meta.loadMoreHref}
                  scroll={false}
                  className="block rounded-md border border-white/10 px-3 py-2 text-center text-[11px] text-white/60 transition-colors hover:bg-white/5 hover:text-white/80"
                >
                  Load more · {loadedCount} of {meta.totalCount}
                </Link>
              );
            })()}
          </BoardColumn>
        </div>
      ))}

      {hiddenColumns.length > 0 ? (
        <aside className="w-[220px] shrink-0 px-1 py-2">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-white/55">
              Hidden columns
            </span>
            <span className="text-[11px] text-white/30">
              {hiddenColumns.length}
            </span>
          </div>
          <div className="space-y-2">
            {hiddenColumns.map((column) => (
              <button
                key={column.status}
                type="button"
                onClick={() => revealEmptyColumn(column.status)}
                className="flex h-10 w-full items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.025] px-3 text-left text-xs text-white/70 transition-colors hover:border-white/10 hover:bg-white/[0.045] hover:text-white/90"
                title={`Show ${column.title} column`}
              >
                <span
                  aria-hidden="true"
                  className={`h-3 w-3 rounded-full border-2 ${
                    hiddenColumnTone[column.status]
                  }`}
                />
                <span className="min-w-0 flex-1 truncate">
                  {column.title}
                </span>
                <span className="text-[11px] text-white/30">0</span>
              </button>
            ))}
          </div>
        </aside>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-2">
      {errorMessage ? (
        <div className="text-[12px] text-[var(--color-error)]">{errorMessage}</div>
      ) : null}

      {!isMounted ? (
        columnsMarkup
      ) : (
        <DndContext
          key={dndSyncKey}
          sensors={sensors}
          onDragStart={(event) => {
            setActiveId(String(event.active.id));
            setIsDragging(true);
          }}
          onDragEnd={handleDragEnd}
          onDragCancel={() => cleanupDragState()}
        >
          {columnsMarkup}

          <DragOverlay dropAnimation={defaultDropAnimation}>
            {activeTask ? (
              <div className="pointer-events-none scale-[1.02] border border-white/16 bg-white/[0.07] shadow-[0_18px_50px_rgba(0,0,0,0.55)] rounded-[6px]">
                <IssueCard
                  issueKey={activeTask.key ?? undefined}
                  title={activeTask.title}
                  type={activeTask.type ?? null}
                  description={activeTask.description}
                  priority={activeTask.priority}
                  status={activeTask.status}
                  createdAt={activeTask.createdAt ?? null}
                  assignee={activeTask.assignee}
                  reporter={activeTask.reporter}
                  requesterName={activeTask.requesterName}
                  users={users}
                  onAssigneeChange={(assigneeId) =>
                    handleAssigneeChange(activeTask.id, assigneeId)
                  }
                  isSavingAssignee={savingAssignee === activeTask.id}
                  canEdit={false}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
};

interface DraggableIssueCardProps {
  task: BoardTask;
  isSaving: boolean;
  users: UserOption[];
  onAssigneeChange: (taskId: string, assigneeId: string | null) => void;
  isSavingAssignee: boolean;
  canEdit: boolean;
}

const DraggableIssueCard: React.FC<DraggableIssueCardProps> = ({
  task,
  isSaving,
  users,
  onAssigneeChange,
  isSavingAssignee,
  canEdit,
}) => {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      disabled: isSaving || !canEdit,
    });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${
        canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default"
      } ${
        isDragging ? "opacity-60" : ""
      }`}
      onClick={() => {
        if (!isDragging && !isSaving) {
          router.push(`/tasks/${task.key ?? task.id}`);
        }
      }}
      {...attributes}
      {...listeners}
    >
      {isSaving ? (
        <span className="absolute right-3 top-3 text-[10px] font-semibold uppercase tracking-wide text-cyan-200/90">
          Saving…
        </span>
      ) : null}

      <IssueCard
        issueKey={task.key ?? undefined}
        title={task.title}
        type={task.type ?? null}
        description={task.description}
        priority={task.priority}
        status={task.status}
        createdAt={task.createdAt ?? null}
        assignee={task.assignee}
        reporter={task.reporter}
        requesterName={task.requesterName}
        users={users}
        onAssigneeChange={(assigneeId) => onAssigneeChange(task.id, assigneeId)}
        isSavingAssignee={isSavingAssignee}
        canEdit={canEdit}
      />
    </div>
  );
};

export default BoardClient;
