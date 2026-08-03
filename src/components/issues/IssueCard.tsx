import React from "react";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import { getPriorityClasses, getStatusLabel } from "./utils";
import type { TaskPriority, TaskStatus } from "@/shared/taskEnums";

type IssueCardProps = {
  issueKey?: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority | null;
  status?: TaskStatus | null;
};

const IssueCard: React.FC<IssueCardProps> = ({
  title,
  issueKey,
  priority,
  status,
  description,
}) => {
  return (
    <Card
      variant="surface"
      className={[
        "rounded-2xl p-4",
        "border border-[rgba(255,255,255,0.08)]",
        "hover:border-[rgba(255,255,255,0.14)] hover:bg-white/[0.02]",
        "transition-colors",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            {issueKey ? (
              <span className="shrink-0 text-xs font-medium text-white/50 font-mono">
                {issueKey}
              </span>
            ) : null}

            <h3 className="min-w-0 text-sm font-semibold text-white/90 truncate">
              {title}
            </h3>
          </div>

          {description ? (
            <p className="mt-2 text-sm text-white/60 line-clamp-2">
              {description}
            </p>
          ) : null}
        </div>

        <div className="shrink-0">
          <Badge className={getPriorityClasses(priority)}>{priority ?? "—"}</Badge>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-white/50">
        <span className="whitespace-nowrap">{getStatusLabel(status)}</span>
      </div>
    </Card>
  );
};

export default IssueCard;
