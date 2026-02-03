import React from "react";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import { getPriorityClasses } from "../issues/utils";
import type { TaskPriority, TaskStatus } from "../../server/validators/task";
import { getDisplayName } from "../../server/auth/displayName";

interface IssueCardProps {
  title: string;
  issueKey?: string | null;
  priority?: TaskPriority | null;
  status?: TaskStatus | string | null; // на Board не используем, но пусть останется в пропсах
  description?: string | null;
  reporter?: { name: string | null; email: string | null } | null;
  requesterName?: string | null;
}

const IssueCard: React.FC<IssueCardProps> = ({
  title,
  issueKey,
  priority,
  description,
  reporter,
  requesterName,
}) => {
  const typeMatch = description?.match(/Тип:\s*([A-Za-zА-Яа-я_-]+)/i);
  const type = typeMatch?.[1] ?? null;

  const cleanDescription = description
    ? description
        .replace(/Тип:\s*[A-Za-zА-Яа-я_-]+/i, "")
        .replace(/Описание:\s*/gi, "")
        .replace(/Шаги:\s*/gi, "")
        .trim()
    : null;

  return (
    <Card
      variant="plain"
      className={[
        "rounded-xl p-3",
        "bg-[rgba(255,255,255,0.01)]",
        "border border-transparent",
        "transition-[background-color,border-color,transform,box-shadow] duration-150",
        "hover:bg-[rgba(255,255,255,0.06)]",
        "hover:border-[rgba(255,255,255,0.10)]",
        "hover:-translate-y-[1px]",
        "hover:shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {type ? (
            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/45">
              {type}
            </span>
          ) : null}

          {issueKey ? (
            <span className="shrink-0 text-xs font-medium text-white/50 font-mono">
              {issueKey}
            </span>
          ) : null}

          <h3 className="min-w-0 text-sm font-medium text-white/90 truncate">
            {title}
          </h3>
        </div>

          {cleanDescription ? (
            <p className="mt-1 text-[11px] text-white/35 truncate">
              {cleanDescription}
            </p>
          ) : null}

          <div className="mt-1 text-[11px] text-white/40">
            •{" "}
            {getDisplayName({
              user: reporter ?? null,
              fallbackName: requesterName ?? null,
            })}
          </div>
        </div>

        <div className="shrink-0">
          <Badge
            className={[
              getPriorityClasses(priority),
              "px-2 py-0.5 text-[11px]",
            ].join(" ")}
          >
            {priority ?? "—"}
          </Badge>
        </div>
      </div>
    </Card>
  );
};

export default IssueCard;
