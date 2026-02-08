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
        "rounded-sm p-2.5",
        "border border-white/4",
        "bg-[rgba(255,255,255,0.02)]",
        "transition-[border-color,background-color] duration-150",
        isOver ? "border-cyan-400/30 bg-cyan-500/5" : "",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
            {title}
          </h2>
          <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-white/55">
            {count}
          </span>
        </div>

        {isOver ? (
          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-100">
            Drop
          </span>
        ) : null}
      </div>

      <div className="space-y-2">{children}</div>

      {count === 0 ? (
        <div className="mt-2 text-[11px] text-white/30">
          Empty
        </div>
      ) : null}
    </Card>
  );
};

export default BoardColumn;
