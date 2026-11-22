import React from "react";
import Link from "next/link";
import Badge from "../ui/Badge";
import IssueTypeBadge from "./IssueTypeBadge";
import {
  formatDate,
  getPriorityClasses,
  getPriorityLabel,
  getStatusLabel,
} from "./utils";
import type { Priority, Status } from "@prisma/client";
import MoveToTodoButton from "./MoveToTodoButton";
import { getDisplayName } from "../../server/auth/displayName";

interface IssueRowProps {
  id?: string;
  title: string;
  issueKey?: string | null;
  type?: string | null;
  priority?: Priority | null;
  status?: Status | null;
  description?: string | null;
  createdAt?: Date | null;
  href?: string;
  showMoveToTodo?: boolean;
  rightActions?: React.ReactNode;
  selection?: React.ReactNode;
  release?: { title: string; href: string } | null;
  rowClassName?: string;
  reporter?: { name: string | null; email: string | null } | null;
  requesterName?: string | null;
}

const IssueRow: React.FC<IssueRowProps> = ({
  id,
  title,
  issueKey,
  type,
  showMoveToTodo,
  priority,
  status,
  createdAt,
  rightActions,
  selection,
  release,
  rowClassName,
  href,
  reporter,
  requesterName,
}) => {
  const reporterLabel = getDisplayName({
    user: reporter ?? null,
    fallbackName: requesterName ?? null,
  });

  const heading = (
    <h3 className="truncate text-[13px] font-medium leading-5 text-white/90" title={title}>{title}</h3>
  );

  return (
    <div
      className={[
        "issue-list-row group relative flex min-h-10 items-center justify-between gap-2 border-b border-white/5 py-1 pl-9 pr-3 sm:gap-3",
        "hover:bg-white/[0.03] transition-colors",
        rightActions ? "[@media(pointer:coarse)]:pr-20 [@media(pointer:coarse)]:sm:pr-36" : "",
        rowClassName ?? "",
      ].join(" ")}
    >
      {selection ? <div className="absolute inset-y-0 left-2 z-10 flex items-center">{selection}</div> : null}
      <div className="flex flex-1 items-center justify-between gap-3 min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            {type ? <IssueTypeBadge type={type} /> : null}

            {issueKey ? (
              <span className="shrink-0 text-[11px] font-medium text-white/45 font-mono">
                {issueKey}
              </span>
            ) : null}

            {href ? (
              <Link href={href} prefetch={false} className="min-w-0 after:absolute after:inset-0 focus-visible:underline">
                {heading}
              </Link>
            ) : heading}
          </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-white/55 sm:gap-2">
        {release ? (
          <Link href={release.href} prefetch={false} title={`Релиз: ${release.title}`} aria-label={`Релиз: ${release.title}`}
            className="relative z-10 max-w-32 truncate rounded bg-[var(--control-bg)] px-1.5 py-0.5 hover:underline">
            <span className="hidden md:inline">{release.title}</span><span aria-hidden="true" className="md:hidden">↗</span>
          </Link>
        ) : null}
        <Badge className={getPriorityClasses(priority)}>
          {getPriorityLabel(priority)}
        </Badge>

        <span className="whitespace-nowrap text-white/50">
          {getStatusLabel(status)}
        </span>

        <span className="hidden whitespace-nowrap text-white/25 lg:inline">·</span>

        <span className="hidden whitespace-nowrap text-white/45 lg:inline">
          {formatDate(createdAt)}
        </span>

        <span className="hidden whitespace-nowrap text-white/25 xl:inline">·</span>
        <span className="hidden max-w-24 truncate whitespace-nowrap text-white/45 xl:inline" title={reporterLabel}>
          {reporterLabel}
        </span>

        {showMoveToTodo && id ? <div className="relative z-10"><MoveToTodoButton taskId={id} /></div> : null}
      </div>
      {rightActions ? (
        <div className="pointer-events-none absolute inset-y-0 right-2 z-10 flex items-center rounded-md px-1 group-focus-within:pointer-events-auto group-focus-within:bg-[var(--surface-popover)] group-hover:pointer-events-auto group-hover:bg-[var(--surface-popover)] [@media(pointer:coarse)]:pointer-events-auto">
          {rightActions}
        </div>
      ) : null}
    </div>
  );

};

export default IssueRow;
