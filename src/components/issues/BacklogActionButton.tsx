"use client";

import React, { useState, useTransition } from "react";
import { updateTaskStatusAction } from "../../server/actions/tasks";
import type { TaskStatus } from "../../server/validators/task";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";

type Tone = "cyan" | "red";

export default function BacklogActionButton(props: {
  taskId: string;
  toStatus: TaskStatus;
  tone: Tone;
  label: string;
  icon?: string; // например ↗ или ✕
  onSuccess?: () => void;
}) {
  const { taskId, toStatus, tone, label, icon, onSuccess } = props;

  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const toneClasses =
    tone === "cyan"
      ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-200/90 hover:bg-cyan-400/15 hover:border-cyan-400/30 hover:text-cyan-100"
      : "border-rose-400/20 bg-rose-400/10 text-rose-200/90 hover:bg-rose-400/15 hover:border-rose-400/30 hover:text-rose-100";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();

        setFailed(false);
        startTransition(async () => {
          const res = await updateTaskStatusAction({ id: taskId, status: toStatus });
          if (res?.ok) {
            onSuccess?.();
          } else {
            if (isAuthRequiredError({ formError: res?.formError ?? null })) {
              showAuthRequiredToast();
              return;
            }
            setFailed(true);
            // авто-сброс “Failed” через секунду
            setTimeout(() => setFailed(false), 1200);
          }
        });
      }}
      className={[
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium",
        "border",
        toneClasses,
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40",
        // actions появляются на hover строки
        "opacity-0 group-hover:opacity-100 transition-opacity",
        isPending ? "pointer-events-none opacity-100" : "",
        failed ? "ring-2 ring-rose-400/30 opacity-100" : "",
      ].join(" ")}
      title={failed ? "Не удалось выполнить действие" : label}
      aria-label={label}
    >
      {isPending ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white/70" />
          {label}
        </span>
      ) : (
        <>
          {icon ? <span className="opacity-80">{icon}</span> : null}
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
