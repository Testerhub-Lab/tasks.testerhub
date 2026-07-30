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
  onHide?: () => void;
  onCreate?: () => void;
}

const statusTone: Partial<Record<TaskStatus, string>> = {
  NEW: "border-white/25",
  TODO: "border-white/35",
  IN_PROGRESS: "border-amber-400",
  TESTING: "border-cyan-400",
  DONE: "border-emerald-400",
};

const BoardColumn: React.FC<BoardColumnProps> = ({
  status,
  title,
  count,
  children,
  disabled = false,
  onHide,
  onCreate,
}) => {
  const { isOver, setNodeRef } = useDroppable({ id: status, disabled });

  return (
    <section
      ref={setNodeRef}
      className={[
        "board-column rounded-[6px] bg-white/[0.012] p-2",
        "transition-colors duration-150",
        count === 0 ? "min-h-[88px]" : "",
        isOver ? "bg-cyan-500/[0.07] ring-1 ring-inset ring-cyan-400/20" : "",
      ].join(" ")}
    >
      <div className="mb-2 flex min-h-7 items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 rounded-full border-2 ${
              statusTone[status] ?? "border-white/35"
            }`}
          />
          <h2 className="truncate text-xs font-semibold text-white/80">
            {title}
          </h2>
          <span className="text-[11px] text-white/45">
            {count}
          </span>
        </div>

        {onHide ? (
          <button
            type="button"
            onClick={onHide}
            className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-sm text-white/35 transition-colors hover:bg-white/5 hover:text-white/70"
            aria-label={`Hide ${title} column`}
            title="Hide empty column"
          >
            ×
          </button>
        ) : isOver ? (
          <span className="rounded-[999px] bg-cyan-500/[0.12] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-100/90">
            Drop
          </span>
        ) : null}
      </div>

      <div className="mb-2 h-px bg-white/[0.07]" />

      <div className="space-y-2">{children}</div>

      {count === 0 ? (
        <div className="mt-2 text-[11px] text-white/25">
          {isOver ? "Drop issue here" : "No issues"}
        </div>
      ) : null}

      {onCreate ? (
        <button
          type="button"
          onClick={onCreate}
          className="board-column__create mt-2 flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-white/40 transition-[background,color,opacity,transform] hover:bg-white/[0.045] hover:text-white/75 focus-visible:bg-white/[0.045] focus-visible:text-white/75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/15"
          aria-label={`Create issue in ${title}`}
          title={`Create issue in ${title}`}
        >
          <span aria-hidden="true" className="text-base leading-none">+</span>
          <span>New issue</span>
        </button>
      ) : null}
    </section>
  );
};

export default BoardColumn;
