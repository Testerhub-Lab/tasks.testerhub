import React from "react";
import Link from "next/link";
import Badge from "../ui/Badge";
import { formatDate, getPriorityClasses, getPriorityLabel, getStatusLabel } from "./utils";
import type { Priority, Status } from "@prisma/client";
import MoveToTodoButton from "./MoveToTodoButton";

interface IssueRowProps {
  id?: string;
  title: string;
  issueKey?: string | null;
  priority?: Priority | null;
  status?: Status | null;
  description?: string | null;
  createdAt?: Date | null;
  href?: string;
  showMoveToTodo?: boolean;
  rightActions?: React.ReactNode;
  rowClassName?: string;
}

const IssueRow: React.FC<IssueRowProps> = ({
  id,
  title,
  issueKey,
  showMoveToTodo,
  priority,
  status,
  createdAt,
  rightActions,
  rowClassName,
  href,
}) => {
  const content = (
    <div
      className={[
        "group flex items-start justify-between gap-4 px-4 py-2.5 border-b border-[var(--divider)] hover:bg-[var(--hover)] transition-colors",
        rowClassName ?? "",
      ].join(" ")}
    >
      <div className="flex flex-1 items-start justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            {issueKey ? (
              <span className="shrink-0 text-xs font-medium text-white/50 font-mono">
                {issueKey}
              </span>
            ) : null}

            <h3 className="min-w-0 text-sm font-semibold text-white/90 leading-5 truncate">
              {title}
            </h3>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 text-xs text-[var(--color-text-secondary)]">
        <Badge className={getPriorityClasses(priority)}>
          {getPriorityLabel(priority)}
        </Badge>

        <span className="whitespace-nowrap">{getStatusLabel(status)}</span>

        <span className="whitespace-nowrap text-white/40">·</span>

        <span className="whitespace-nowrap">{formatDate(createdAt)}</span>

        {showMoveToTodo && id ? <MoveToTodoButton taskId={id} /> : null}
        {rightActions}
      </div>
    </div>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
};

export default IssueRow;
