"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import type { TaskStatus } from "../../server/validators/task";
import Card from "../ui/Card";

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
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <Card
      ref={setNodeRef}
      variant="surface"
      className={[
        "rounded-2xl p-3",
        "!bg-[rgba(255,255,255,0.03)]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        "transition-[border-color,background-color,box-shadow] duration-150",
        isOver ? "ring-2 ring-cyan-400/35 border-cyan-400/30" : "",
      ].join(" ")}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/55">
            {title}
          </h2>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/60">
            {count}
          </span>
        </div>

        {isOver ? (
          <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
            Drop
          </span>
        ) : null}
      </div>

      <div className="space-y-2">{children}</div>

      {count === 0 ? (
      <div className="mt-3 text-xs text-white/30">
        Empty
      </div>
    ) : null}
    </Card>
  );
};

export default BoardColumn;
