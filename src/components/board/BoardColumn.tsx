"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import type { TaskStatus } from "../../server/validators/task";

interface BoardColumnProps {
  status: TaskStatus;
  title: string;
  count: number;
  children: React.ReactNode;
}

const BoardColumn: React.FC<BoardColumnProps> = ({
  status,
  title,
  count,
  children,
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: status,
  });

  return (
    <section
      ref={setNodeRef}
      className={`rounded-2xl border border-[var(--color-card-border)] bg-[rgba(18,24,46,0.4)] p-4 transition-all ${
        isOver
          ? "border-cyan-400/30 bg-white/5 ring-2 ring-cyan-400/60"
          : ""
      }`}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {isOver ? (
            <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
              Drop here
            </span>
          ) : null}
          <span className="text-xs text-[var(--color-text-secondary)]">{count}</span>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
};

export default BoardColumn;
