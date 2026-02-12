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
import { updateTaskStatusAction } from "../../server/actions/tasks";
import { useRouter } from "next/navigation";
import type { TaskStatus } from "../../server/validators/task";
import { Priority } from "@prisma/client";

type Status = TaskStatus;

type BoardTask = {
  id: string;
  key: string | null;
  title: string;
  type: string | null;
  description: string | null;
  priority: Priority;
  status: Status;
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
}

const BoardClient: React.FC<BoardClientProps> = ({ tasks }) => {
  const router = useRouter();
  const [isMounted, setMounted] = useState(false);
  const [items, setItems] = useState<BoardTask[]>(tasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savingMove, setSavingMove] = useState<{
    id: string;
    to: Status;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setItems(tasks);
  }, [tasks]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (activeId) {
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
    return () => {
      document.body.classList.remove("is-dragging");
      document.documentElement.classList.remove("is-dragging");
      document.body.style.cursor = "";
      document.documentElement.style.cursor = "";
    };
  }, [activeId]);

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
      setActiveId(null);
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
      setActiveId(null);
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
                reporter={task.reporter}
                requesterName={task.requesterName}
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
          onDragStart={(event) => setActiveId(String(event.active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
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
                  reporter={activeTask.reporter}
                  requesterName={activeTask.requesterName}
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
}

const DraggableIssueCard: React.FC<DraggableIssueCardProps> = ({
  task,
  isSaving,
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
        reporter={task.reporter}
        requesterName={task.requesterName}
      />
    </div>
  );
};

export default BoardClient;
