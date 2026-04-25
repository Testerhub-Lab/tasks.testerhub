import React from "react";
import Link from "next/link";
import Badge from "../ui/Badge";
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
  rowClassName,
  href,
  reporter,
  requesterName,
}) => {
  const reporterLabel = getDisplayName({
    user: reporter ?? null,
    fallbackName: requesterName ?? null,
  });

  const content = (
    <div
      className={[
        // плотнее, площе, разделители вместо рамок
        "group flex items-center justify-between gap-4 px-4 py-2 border-b border-white/5",
        "hover:bg-white/[0.03] transition-colors",
        rowClassName ?? "",
      ].join(" ")}
    >
      <div className="flex flex-1 items-center justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {type ? (
              <span className="shrink-0 rounded-[6px] bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-white/50">
                {type}
              </span>
            ) : null}

            {issueKey ? (
              <span className="shrink-0 text-[11px] font-medium text-white/45 font-mono">
                {issueKey}
              </span>
            ) : null}

            <h3 className="min-w-0 text-[13px] font-medium text-white/90 leading-5 truncate">
              {title}
            </h3>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 text-[11px] text-white/55">
        <Badge className={getPriorityClasses(priority)}>
          {getPriorityLabel(priority)}
        </Badge>

        <span className="whitespace-nowrap text-white/50">
          {getStatusLabel(status)}
        </span>

        <span className="whitespace-nowrap text-white/25">·</span>

        <span className="whitespace-nowrap text-white/45">
          {formatDate(createdAt)}
        </span>

        <span className="whitespace-nowrap text-white/25">·</span>

        <span className="whitespace-nowrap text-white/45">
          {reporterLabel}
        </span>

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
