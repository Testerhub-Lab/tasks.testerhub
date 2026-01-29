"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import IssueRow from "./IssueRow";
import BacklogActionButton from "./BacklogActionButton";
import type { TaskPriority, TaskStatus } from "../../server/validators/task";

export default function BacklogRowClient(props: {
  id: string;
  title: string;
  issueKey?: string | null;
  priority?: TaskPriority | null;
  status?: TaskStatus | string | null;
  createdAt?: Date | null;
  href: string;
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
      <IssueRow
        title={props.title}
        issueKey={props.issueKey}
        priority={props.priority}
        status={props.status}
        createdAt={props.createdAt}
        href={props.href}
        // можно слегка приглушить hover, когда строка уходит
        rowClassName={isLeaving ? "pointer-events-none" : ""}
        rightActions={
          <div className="flex items-center gap-2">
            <BacklogActionButton
              taskId={props.id}
              toStatus="Todo"
              tone="cyan"
              icon="↗"
              label="Move"
              onSuccess={onSuccess}
            />
            <BacklogActionButton
              taskId={props.id}
              toStatus="Done"
              tone="red"
              icon="✕"
              label="Dismiss"
              onSuccess={onSuccess}
            />
          </div>
        }
      />
    </div>
  );
}
