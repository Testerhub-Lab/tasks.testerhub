import React from "react";
import Link from "next/link";
import Badge from "../ui/Badge";
import { formatDate, getPriorityClasses, getStatusLabel } from "./utils";
import type { TaskPriority, TaskStatus } from "../../server/validators/task";

interface IssueRowProps {
  title: string;
  issueKey?: string | null;
  priority?: TaskPriority | null;
  status?: TaskStatus | string | null;
  description?: string | null;
  createdAt?: Date | null;
  href?: string;
}

const IssueRow: React.FC<IssueRowProps> = ({
  title,
  issueKey,
  priority,
  status,
  description,
  createdAt,
  href,
}) => {
  const content = (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] p-4 transition-colors hover:border-[rgba(0,184,217,0.4)]">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          {issueKey ? (
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              {issueKey}
            </div>
          ) : null}
          <h3 className="text-base font-semibold text-white">{title}</h3>
          {description ? (
            <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2">
              {description}
            </p>
          ) : null}
        </div>
        <Badge className={getPriorityClasses(priority)}>{priority ?? "—"}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--color-text-secondary)]">
        <span>{getStatusLabel(status)}</span>
        <span>Created {formatDate(createdAt)}</span>
      </div>
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
};

export default IssueRow;
