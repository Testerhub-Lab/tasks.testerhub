"use client";

import React from "react";

export type UploadState = "queued" | "uploading" | "done" | "error";

export type AttachmentItem = {
  clientId: string;
  name: string;
  size: number;
  type: string;
  state: UploadState;
  url?: string;
  error?: string;
  file?: File;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const rounded = i === 0 ? `${Math.round(v)}` : v.toFixed(v < 10 ? 2 : 1);
  return `${rounded} ${units[i]}`;
}

type Props = {
  items: AttachmentItem[];
  onRemove: (clientId: string) => void;
  onOpen?: (url: string) => void;
};

export default function AttachmentsPanel({ items, onRemove, onOpen }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {items.map((a) => {
        const secondary =
          a.state === "queued"
            ? "ready to upload"
            : a.state === "uploading"
            ? "uploading…"
            : a.state === "error"
              ? a.error || "upload failed"
              : formatBytes(a.size);

        return (
          <div
            key={a.clientId}
            className={cn(
              "flex items-center justify-between gap-3",
              "rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200/80">
                📄
              </div>

              <div className="min-w-0">
                <div className="truncate text-[13px] text-slate-100">{a.name}</div>
                <div
                  className={cn(
                    "text-[11px]",
                    a.state === "error" ? "text-red-300/80" : "text-slate-400/70"
                  )}
                >
                  {secondary}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!a.url || a.state !== "done"}
                className="rounded-md p-2 text-slate-200/70 hover:bg-white/5 disabled:cursor-not-allowed disabled:text-slate-200/30"
                title={a.url ? "Open" : "Not uploaded yet"}
                aria-label="Open"
                onClick={() => {
                  if (!a.url || a.state !== "done") return;
                  if (onOpen) onOpen(a.url);
                  else window.open(a.url, "_blank");
                }}
              >
                ⬇︎
              </button>

              <button
                type="button"
                className="rounded-md p-2 text-slate-200/70 hover:bg-white/5 hover:text-slate-100"
                title="Remove"
                aria-label="Remove"
                onClick={() => onRemove(a.clientId)}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
