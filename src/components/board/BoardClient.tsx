"use client";

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

type Status = TaskStatus;

type BoardTask = {
  id: string;
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

const columns: { status: Status; title: string }[] = [
  { status: "TODO", title: "Todo" },
  { status: "IN_PROGRESS", title: "In progress" },
  { status: "TESTING", title: "Testing" },
  { status: "DONE", title: "Done" },
];

interface BoardClientProps {
  tasks: BoardTask[];
  users: UserOption[];
}

const BoardClient: React.FC<BoardClientProps> = ({ tasks, users }) => {
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setItems(tasks);
  }, [tasks]);

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
    if (task.status === to) return;

    // optimistic UI
    setItems((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: to } : t))
    );

    setSavingMove({ id: taskId, to });

    try {
      await updateTaskStatusAction({ id: taskId, status: to });
      router.refresh();
    } catch (e) {
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
    } catch (e) {
      setItems(previous);
      setErrorMessage("Не удалось обновить исполнителя.");
    } finally {
      setSavingAssignee(null);
    }
  };

  const columnsMarkup = (
    <div className="grid gap-2 lg:grid-cols-4">
      {columns.map((column) => (
        <BoardColumn
          key={column.status}
          status={column.status}
          title={column.title}
          count={grouped[column.status]?.length ?? 0}
          disabled={!isMounted}
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
              />
            )
          )}
        </BoardColumn>
      ))}
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
}

const DraggableIssueCard: React.FC<DraggableIssueCardProps> = ({
  task,
  isSaving,
  users,
  onAssigneeChange,
  isSavingAssignee,
}) => {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      disabled: isSaving,
    });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative cursor-grab active:cursor-grabbing ${
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
      />
    </div>
  );
};

export default BoardClient;
