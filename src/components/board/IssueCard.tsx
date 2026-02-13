"use client";

import React, { useEffect, useRef, useState } from "react";
import Card from "../ui/Card";
import type { TaskPriority, TaskStatus } from "../../server/validators/task";
import { getDisplayName } from "../../server/auth/displayName";

type AssigneeOption = { id: string; name: string | null; email: string | null };

interface IssueCardProps {
  title: string;
  issueKey?: string | null;
  type?: string | null;
  priority?: TaskPriority | null;
  status?: TaskStatus | string | null; // на Board не используем, но пусть останется в пропсах
  description?: string | null;
  createdAt?: string | Date | null;
  assignee?: { id: string; name: string | null; email: string | null } | null;
  reporter?: { name: string | null; email: string | null } | null;
  requesterName?: string | null;
  users?: AssigneeOption[];
  onAssigneeChange?: (assigneeId: string | null) => void;
  isSavingAssignee?: boolean;
}

const IssueCard: React.FC<IssueCardProps> = ({
  title,
  issueKey,
  type,
  priority,
  description,
  createdAt,
  assignee,
  reporter,
  requesterName,
  users = [],
  onAssigneeChange,
  isSavingAssignee = false,
}) => {
  const resolvedType = type?.trim() || null;

  const cleanDescription = description
    ? description
        .replace(/Тип:\s*[A-Za-zА-Яа-я_-]+/i, "")
        .replace(/Описание:\s*/gi, "")
        .replace(/Шаги:\s*/gi, "")
        .trim()
    : null;

  const assigneeName = assignee
    ? getDisplayName({ user: assignee, fallbackName: null })
    : null;
  const assigneeInitials = assigneeName
    ? assigneeName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("")
    : null;
  const metaName = getDisplayName({
    user: reporter ?? null,
    fallbackName: requesterName ?? null,
  });

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

  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const assigneeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!assigneeOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!assigneeRef.current) return;
      if (!assigneeRef.current.contains(event.target as Node)) {
        setAssigneeOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAssigneeOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [assigneeOpen]);

  return (
    <Card
      variant="plain"
      className={[
        // плоско, без рамок, без "прыжка", мягкий hover как у Linear
        "issue-card rounded-[6px] p-3",
        "bg-white/[0.05] border border-white/12 shadow-[0_10px_26px_rgba(0,0,0,0.28)]",
        "transition-[background,border-color,box-shadow,transform] duration-150",
        "hover:bg-white/[0.06] hover:border-white/18 hover:shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:-translate-y-[1px]",
        "focus-visible:ring-2 focus-visible:ring-white/10 outline-none",
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
            <div className="relative" ref={assigneeRef}>
              <button
                type="button"
                className={`inline-flex h-[28px] w-[28px] items-center justify-center rounded-full border text-[11px] font-semibold ${
                  assigneeName
                    ? "bg-white/6 border-white/10 text-white/85"
                    : "bg-white/4 border-white/8 text-white/35"
                } ${isSavingAssignee ? "opacity-60" : ""}`}
                title={assigneeName ?? "Unassigned"}
                onClick={(event) => {
                  event.stopPropagation();
                  setAssigneeOpen((v) => !v);
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                }}
              >
                {assigneeInitials ?? "—"}
              </button>
              {assigneeOpen ? (
                <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-lg border border-white/10 bg-[rgba(6,10,20,0.92)] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                    onClick={(event) => {
                      event.stopPropagation();
                      setAssigneeOpen(false);
                      onAssigneeChange?.(null);
                    }}
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-white/60">
                      —
                    </span>
                    No assignee
                  </button>
                  <div className="my-1 h-px bg-white/5" />
                  <div className="max-h-56 overflow-y-auto">
                    {users.map((user) => {
                      const label = getDisplayName({ user, fallbackName: null });
                      const initials = label
                        ? label
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0]?.toUpperCase())
                            .join("")
                        : (user.email ?? "")
                            .slice(0, 2)
                            .toUpperCase() || "U";
                      return (
                        <button
                          key={user.id}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                          onClick={(event) => {
                            event.stopPropagation();
                            setAssigneeOpen(false);
                            onAssigneeChange?.(user.id);
                          }}
                        >
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-white/70">
                            {initials}
                          </span>
                          <span className="truncate">{label || user.email}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {typeLabel || metaName ? (
          <div className="flex items-center gap-2 text-xs text-white/60">
            {typeLabel ? (
              <span className="inline-flex items-center gap-2" title={`Type: ${typeLabel}`}>
                <span className={`inline-flex h-1.5 w-1.5 rounded-full ${typeDotClass}`} />
                <span>{typeLabel}</span>
              </span>
            ) : null}
            {typeLabel && metaName ? (
              <span className="text-white/30">·</span>
            ) : null}
            {metaName ? <span className="truncate">{metaName}</span> : null}
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
