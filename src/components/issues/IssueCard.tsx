import React from "react";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import { getPriorityClasses, getStatusLabel } from "./utils";

interface IssueCardProps {
  title: string;
  priority?: string | null;
  status?: string | null;
  description?: string | null;
}

const IssueCard: React.FC<IssueCardProps> = ({
  title,
  priority,
  status,
  description,
}) => {
  return (
    <Card className="space-y-3 border border-transparent hover:border-[var(--color-card-border)] transition-colors">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <Badge className={getPriorityClasses(priority)}>{priority ?? "—"}</Badge>
      </div>
      {description ? (
        <p className="text-sm text-[var(--color-text-secondary)] line-clamp-3">
          {description}
        </p>
      ) : null}
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
        <span>Status:</span>
        <span className="text-white">{getStatusLabel(status)}</span>
      </div>
    </Card>
  );
};

export default IssueCard;
