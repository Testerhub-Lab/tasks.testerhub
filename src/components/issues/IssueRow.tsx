import React from "react";
import Badge from "../ui/Badge";
import { getPriorityClasses, getStatusLabel } from "./utils";

interface IssueRowProps {
  title: string;
  priority?: string | null;
  status?: string | null;
  description?: string | null;
  createdAt?: Date | null;
}

const IssueRow: React.FC<IssueRowProps> = ({
  title,
  priority,
  status,
  description,
  createdAt,
}) => {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
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
        {createdAt ? (
          <span>Created {createdAt.toLocaleDateString()}</span>
        ) : null}
      </div>
    </div>
  );
};

export default IssueRow;
