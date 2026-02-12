"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import type { TaskStatus } from "../../server/validators/task";

interface BoardColumnProps {
  status: TaskStatus;
  title: string;
  count: number;
  children: React.ReactNode;
  disabled?: boolean;
}

const BoardColumn: React.FC<BoardColumnProps> = ({
  status,
  title,
  count,
  children,
  disabled = false,
}) => {
  const { isOver, setNodeRef } = useDroppable({ id: status, disabled });

  return (
    <section
      ref={setNodeRef}
      className={[
        // плоско, без рамок, ближе к Linear
        "rounded-[8px] p-2.5",
        "border border-white/5 bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
        "transition-colors duration-150",
        isOver ? "bg-cyan-500/[0.06]" : "hover:bg-white/[0.03]",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-white/45 truncate">
            {title}
          </h2>
          <span className="rounded-[6px] bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/55">
            {count}
          </span>
        </div>

        {isOver ? (
          <span className="rounded-[999px] bg-cyan-500/[0.12] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-100/90">
            Drop
          </span>
        ) : null}
      </div>

      {/* разделитель вместо рамки */}
      <div className="mb-2 h-px bg-white/7" />

      <div className="space-y-2">{children}</div>

      {count === 0 ? (
        <div className="mt-2 text-[11px] text-white/30">Empty</div>
      ) : null}
    </section>
  );
};

export default BoardColumn;
