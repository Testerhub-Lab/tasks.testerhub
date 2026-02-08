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
import { Status } from "@prisma/client";
import type { TaskListItem } from "../../server/queries/tasks";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";


type BoardTask = TaskListItem;

const columns: Array<{ status: Status; title: string }> = [
  { status: Status.TODO, title: "To Do" },
  { status: Status.IN_PROGRESS, title: "In Progress" },
  { status: Status.TESTING, title: "Testing" },
  { status: Status.DONE, title: "Done" },
];

interface BoardClientProps {
  tasks: TaskListItem[];
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

  useEffect(() => {
    setMounted(true);
  }, []);

  const grouped = useMemo(() => {
    return columns.reduce<Record<Status, BoardTask[]>>((acc, column) => {
      acc[column.status] = items.filter(
        (task) => task.status === column.status
      );
      return acc;
    }, {} as Record<Status, BoardTask[]>);
  }, [items]);

  const activeTask = items.find((task) => task.id === activeId);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) {
      return;
    }
    const taskId = String(active.id);
    const targetStatus = over.id as Status;
    const currentTask = items.find((task) => task.id === taskId);
    if (!currentTask || currentTask.status === targetStatus) {
      return;
    }

    const previousItems = structuredClone(items);
    const nextItems = items.map((task) =>
      task.id === taskId ? { ...task, status: targetStatus } : task
    );
    setItems(nextItems);
    setSavingMove({ id: taskId, to: targetStatus });
    setErrorMessage(null);
    try {
      const result = await updateTaskStatusAction({
        id: taskId,
        status: targetStatus,
      });
      if (!result.ok) {
        setItems(previousItems);
        if (isAuthRequiredError({ formError: result.formError ?? null })) {
          showAuthRequiredToast();
        } else {
          setErrorMessage(result.formError ?? "Не удалось обновить статус.");
        }
        return;
      }
      setErrorMessage(null);
      router.refresh();
    } catch (error) {
      console.error(error);
      setItems(previousItems);
      setErrorMessage("Ошибка при сохранении статуса.");
    } finally {
      setSavingMove(null);
    }
  };

  return (
    <div className="space-y-3">
      {errorMessage ? (
        <div className="text-sm text-[var(--color-error)]">{errorMessage}</div>
      ) : null}
      {!isMounted ? (
        <div className="grid gap-3 lg:grid-cols-4">
          {columns.map((column) => (
            <section
              key={column.status}
              className="rounded-lg border border-white/5 bg-[rgba(255,255,255,0.02)] p-2.5"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                  {column.title}
                </h2>
                <span className="text-[11px] text-white/40">
                  {grouped[column.status]?.length ?? 0}
                </span>
              </div>
              <div className="space-y-2">
                {grouped[column.status]?.map((task) => (
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
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(event) => setActiveId(String(event.active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="grid gap-3 lg:grid-cols-4">
            {columns.map((column) => (
              <BoardColumn
                key={column.status}
                status={column.status}
                title={column.title}
                count={grouped[column.status]?.length ?? 0}
              >
                {grouped[column.status]?.map((task) => (
                  <DraggableIssueCard
                    key={task.id}
                    task={task}
                    isSaving={savingMove?.id === task.id}
                  />
                ))}
              </BoardColumn>
            ))}
          </div>
          <DragOverlay dropAnimation={defaultDropAnimation}>
            {activeTask ? (
              <div className="pointer-events-none">
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
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
      className={`relative ${isDragging ? "opacity-60" : ""}`}
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
