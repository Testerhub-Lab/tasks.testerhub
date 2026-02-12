import React from "react";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import { getPriorityClasses } from "../issues/utils";
import type { TaskPriority, TaskStatus } from "../../server/validators/task";
import { getDisplayName } from "../../server/auth/displayName";

interface IssueCardProps {
  title: string;
  issueKey?: string | null;
  type?: string | null;
  priority?: TaskPriority | null;
  status?: TaskStatus | string | null; // на Board не используем, но пусть останется в пропсах
  description?: string | null;
  reporter?: { name: string | null; email: string | null } | null;
  requesterName?: string | null;
}

const IssueCard: React.FC<IssueCardProps> = ({
  title,
  issueKey,
  type,
  priority,
  description,
  reporter,
  requesterName,
}) => {
  const resolvedType = type?.trim() || null;

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
        // плоско, без рамок, без "прыжка", мягкий hover как у Linear
        "rounded-[6px] p-2.5",
        "bg-white/[0.05] border border-white/12 shadow-[0_10px_26px_rgba(0,0,0,0.28)]",
        "transition-[background,border-color,box-shadow,transform] duration-150",
        "hover:bg-white/[0.06] hover:border-white/18 hover:shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:-translate-y-[1px]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {resolvedType ? (
              <span className="shrink-0 rounded-[6px] bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-white/50">
                {resolvedType}
              </span>
            ) : null}

            {issueKey ? (
              <span className="shrink-0 text-[11px] font-medium text-white/50 font-mono">
                {issueKey}
              </span>
            ) : null}

            <h3 className="min-w-0 text-[13px] font-medium text-white/92 truncate">
              {title}
            </h3>
          </div>

          {cleanDescription ? (
            <p className="mt-1 text-[11px] text-white/55 truncate">
              {cleanDescription}
            </p>
          ) : null}

          <div className="mt-1 text-[11px] text-white/60">
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
              "px-2 py-0.5 text-[10px]",
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
