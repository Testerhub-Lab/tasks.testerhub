"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskStatusAction } from "../../server/actions/tasks";

export default function MoveToTodoButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault(); // чтобы Link не навигировал
        e.stopPropagation();

        setError(null);
        startTransition(async () => {
          try {
            await updateTaskStatusAction({ id: taskId, status: "Todo" });
            router.refresh(); // backlog сам уберёт задачу (она перестанет быть New)
          } catch (err) {
            setError("Failed");
          }
        });
      }}
      className={[
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium",
        "border border-cyan-400/20 bg-cyan-400/10 text-cyan-200/90",
        "hover:bg-cyan-400/15 hover:border-cyan-400/30 hover:text-cyan-100",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40",
        "opacity-0 group-hover:opacity-100 transition-opacity",
        isPending ? "pointer-events-none opacity-100" : "",
      ].join(" ")}
      title={error ? "Не удалось переместить в To Do" : "Move to To Do"}
      aria-label="Move to To Do"
    >
      {isPending ? (
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white/70" />
        Move
      </span>
    ) : (
      <>
        <span className="text-cyan-200/80">↗</span>
        <span>Move</span>
        <span className="text-cyan-200/70">To Do</span>
      </>
    )}
    </button>
  );
}
