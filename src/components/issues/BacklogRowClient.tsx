"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import IssueRow from "./IssueRow";
import BacklogActionButton from "./BacklogActionButton";
import type { Priority, Status } from "@prisma/client";


export default function BacklogRowClient(props: {
  id: string;
  title: string;
  issueKey?: string | null;
  type?: string | null;
  priority?: Priority | null;
  status?: Status | null;
  createdAt?: Date | null;
  href: string;
  reporter?: { name: string | null; email: string | null } | null;
  requesterName?: string | null;
  selected?: boolean;
  selectionActive?: boolean;
  onSelectionChange?: (selected: boolean) => void;
  onRemoved?: () => void;
}) {
  const router = useRouter();
  const [isLeaving, setIsLeaving] = useState(false);
  const [isGone, setIsGone] = useState(false);
  const [, startTransition] = useTransition();

  const onSuccess = () => {
    // 1) красиво уводим строку
    setIsLeaving(true);

    // 2) после анимации убираем из DOM и обновляем данные (счётчик issues, и т.д.)
    window.setTimeout(() => {
      setIsGone(true);
      props.onRemoved?.();
      startTransition(() => router.refresh());
    }, 220);
  };

  if (isGone) return null;

  return (
    <div
      className={[
        "overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
        isLeaving ? "max-h-0 opacity-0" : "max-h-24 opacity-100",
      ].join(" ")}
    >
      <div className="group/backlog-row flex items-stretch">
        <label
          className={`flex w-10 shrink-0 items-center justify-center border-b border-white/5 transition-colors ${
            props.selected ? "bg-cyan-400/[0.06]" : ""
          }`}
          title="Select issue"
        >
          <input
            type="checkbox"
            checked={props.selected ?? false}
            onChange={(event) =>
              props.onSelectionChange?.(event.currentTarget.checked)
            }
            className={`h-3.5 w-3.5 cursor-pointer accent-cyan-400 transition-opacity ${
              props.selected || props.selectionActive
                ? "opacity-100"
                : "opacity-0 group-hover/backlog-row:opacity-100 focus-visible:opacity-100"
            }`}
            aria-label={`Select ${props.issueKey ?? props.title}`}
          />
        </label>

        <div className="min-w-0 flex-1">
          <IssueRow
            title={props.title}
            issueKey={props.issueKey}
            type={props.type}
            priority={props.priority}
            status={props.status}
            createdAt={props.createdAt}
            reporter={props.reporter}
            requesterName={props.requesterName}
            href={props.href}
            rowClassName={[
              isLeaving ? "pointer-events-none" : "",
              props.selected ? "bg-cyan-400/[0.06]" : "",
            ].join(" ")}
            rightActions={
              <div className="flex items-center gap-2">
                <BacklogActionButton
                  taskId={props.id}
                  toStatus="TODO"
                  tone="cyan"
                  icon="↗"
                  label="Move"
                  onSuccess={onSuccess}
                />
                <BacklogActionButton
                  taskId={props.id}
                  toStatus="REJECT"
                  tone="red"
                  icon="✕"
                  label="Dismiss"
                  onSuccess={onSuccess}
                />
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}
