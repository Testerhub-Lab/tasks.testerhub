import React from "react";
import Card from "../ui/Card";
import type { TaskPriority, TaskStatus } from "../../server/validators/task";
import { getDisplayName } from "../../server/auth/displayName";

interface IssueCardProps {
  title: string;
  issueKey?: string | null;
  type?: string | null;
  priority?: TaskPriority | null;
  status?: TaskStatus | string | null; // на Board не используем, но пусть останется в пропсах
  description?: string | null;
  createdAt?: string | Date | null;
  reporter?: { name: string | null; email: string | null } | null;
  requesterName?: string | null;
}

const IssueCard: React.FC<IssueCardProps> = ({
  title,
  issueKey,
  type,
  priority,
  description,
  createdAt,
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

  const assigneeName = getDisplayName({
    user: reporter ?? null,
    fallbackName: requesterName ?? null,
  });
  const assigneeInitials = assigneeName
    ? assigneeName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("")
    : null;

  const typeLabel = resolvedType
    ? resolvedType.charAt(0).toUpperCase() + resolvedType.slice(1).toLowerCase()
    : null;

  const typeDotClass = resolvedType
    ? resolvedType.toUpperCase().includes("BUG")
      ? "bg-cyan-400/80"
      : resolvedType.toUpperCase().includes("TASK")
        ? "bg-purple-400/80"
        : "bg-white/30"
    : "bg-white/30";

  const priorityLevel = (() => {
    if (!priority) return 0;
    const value = String(priority).toUpperCase();
    if (value.includes("CRITICAL")) return 4;
    if (value.includes("HIGH")) return 3;
    if (value.includes("MEDIUM")) return 2;
    if (value.includes("LOW")) return 1;
    return 0;
  })();

  const createdAtDate = (() => {
    if (!createdAt) return null;
    const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
    return Number.isNaN(date.getTime()) ? null : date;
  })();

  const formatRelativeTime = (date: Date, now = new Date()) => {
    const diffMs = Math.max(0, now.getTime() - date.getTime());
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "1m ago";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  };

  const formatAbsoluteDate = (date: Date) =>
    date.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  return (
    <Card
      variant="plain"
      className={[
        // плоско, без рамок, без "прыжка", мягкий hover как у Linear
        "issue-card rounded-[6px] p-3",
        "bg-white/[0.05] border border-white/12 shadow-[0_10px_26px_rgba(0,0,0,0.28)]",
        "transition-[background,border-color,box-shadow,transform] duration-150",
        "hover:bg-white/[0.06] hover:border-white/18 hover:shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:-translate-y-[1px]",
      ].join(" ")}
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          {issueKey ? (
            <span className="flex-none whitespace-nowrap text-[11px] text-white/65 font-medium font-mono">
              {issueKey}
            </span>
          ) : null}

          <div className="flex-1 min-w-0">
            <h3
              className="text-[13px] font-medium text-white/92 truncate leading-5"
              title={cleanDescription ?? title}
            >
              {title}
            </h3>
          </div>

          <div className="flex-none flex items-center gap-2">
            {priorityLevel ? (
              <span
                className="inline-flex items-end gap-1 text-white/70"
                title={`Priority: ${String(priority)}`}
              >
                {Array.from({ length: 4 }).map((_, index) => {
                  const level = index + 1;
                  return (
                    <span
                      key={level}
                      className={`block w-[3px] rounded-[2px] bg-white ${
                        level <= priorityLevel ? "opacity-90" : "opacity-25"
                      }`}
                      style={{ height: 6 + level * 2 }}
                    />
                  );
                })}
              </span>
            ) : null}
            <span
              className={`inline-flex h-[20px] w-[20px] items-center justify-center rounded-full border text-[11px] font-semibold ${
                assigneeInitials
                  ? "bg-white/6 border-white/10 text-white/80"
                  : "bg-white/4 border-white/8 text-white/30"
              }`}
              title={assigneeName ?? "Unassigned"}
            >
              {assigneeInitials ?? ""}
            </span>
          </div>
        </div>

        {typeLabel || assigneeName ? (
          <div className="flex items-center gap-2 text-xs text-white/60">
            {typeLabel ? (
              <span className="inline-flex items-center gap-2" title={`Type: ${typeLabel}`}>
                <span className={`inline-flex h-1.5 w-1.5 rounded-full ${typeDotClass}`} />
                <span>{typeLabel}</span>
              </span>
            ) : null}
            {typeLabel && assigneeName ? (
              <span className="text-white/30">·</span>
            ) : null}
            {assigneeName ? <span className="truncate">{assigneeName}</span> : null}
          </div>
        ) : null}

        {createdAtDate ? (
          <div
            className="text-[11px] text-white/45"
            title={`Created ${formatAbsoluteDate(createdAtDate)}`}
          >
            Created • {formatRelativeTime(createdAtDate)}
          </div>
        ) : null}
      </div>
    </Card>
  );
};

export default IssueCard;
