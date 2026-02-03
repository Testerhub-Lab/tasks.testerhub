"use client";

import React, { useEffect, useState } from "react";
import { dismissToast, subscribeToToasts, type ToastItem } from "./toast";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToToasts(setItems), []);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto rounded-xl border bg-slate-950/70 backdrop-blur-xl shadow-[0_16px_60px_rgba(0,0,0,0.55)]",
            t.kind === "success" && "border-emerald-400/20",
            t.kind === "error" && "border-red-400/25",
            t.kind === "info" && "border-white/10"
          )}
        >
          <div className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <div className="text-[13px] text-slate-100">{t.title}</div>
              {t.description && (
                <div className="mt-0.5 text-[12px] text-slate-300/70">{t.description}</div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {t.action ? (
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[12px] text-cyan-100/90 hover:bg-white/5"
                  onClick={() => {
                    t.action?.onClick();
                    dismissToast(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-md p-1.5 text-slate-200/60 hover:bg-white/5 hover:text-slate-100"
                aria-label="Dismiss"
                onClick={() => dismissToast(t.id)}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
