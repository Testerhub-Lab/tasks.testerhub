"use client";

import React, { useEffect, useRef, useState } from "react";
import Card from "../ui/Card";
import type { TaskPriority, TaskStatus } from "@/shared/taskEnums";
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
  canEdit?: boolean;
}

const IssueCard: React.FC<IssueCardProps> = ({
  title,
  issueKey,
  type,
  priority,
  assignee,
  users = [],
  onAssigneeChange,
  isSavingAssignee = false,
  canEdit = true,
}) => {
  const resolvedType = type?.trim() || null;

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
      padding="none"
      className={[
        "group issue-card rounded-[6px] px-3 py-2.5",
        "border border-white/[0.075] bg-white/[0.032] shadow-[0_1px_2px_rgba(0,0,0,0.18)]",
        "transition-[background,border-color,box-shadow] duration-150",
        "hover:border-white/[0.12] hover:bg-white/[0.05] hover:shadow-[0_4px_14px_rgba(0,0,0,0.2)]",
        "focus-visible:ring-2 focus-visible:ring-white/10 outline-none",
      ].join(" ")}
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {typeLabel ? (
              <span
                className={`ui-tooltip inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${typeDotClass}`}
                data-tooltip={`Type: ${typeLabel}`}
                aria-label={`Type: ${typeLabel}`}
              />
            ) : null}
            {issueKey ? (
              <span className="truncate whitespace-nowrap font-mono text-[11px] font-medium text-white/42">
                {issueKey}
              </span>
            ) : null}
          </div>

          <div className="flex flex-none items-center gap-2 text-white/55 transition-colors group-hover:text-white/75">
            {priorityLevel ? (
              <span
                className="ui-tooltip inline-flex items-end gap-[2px]"
                data-tooltip={`Priority: ${String(priority)}`}
                aria-label={`Priority: ${String(priority)}`}
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
                disabled={!canEdit}
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors ${
                  assigneeName
                    ? "border-white/10 bg-white/6 text-white/80 hover:bg-white/10"
                    : "border-white/8 bg-white/4 text-white/30 hover:bg-white/8 hover:text-white/55"
                } ${isSavingAssignee ? "opacity-60" : ""}`}
                title={assigneeName ?? "Unassigned"}
                onClick={(event) => {
                  event.stopPropagation();
                  if (canEdit) setAssigneeOpen((v) => !v);
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                }}
              >
                {assigneeInitials ?? "—"}
              </button>
              {canEdit && assigneeOpen ? (
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

        <h3
          className="line-clamp-2 break-words text-sm font-medium leading-5 text-white/90"
          title={title}
        >
          {title}
        </h3>
      </div>
    </Card>
  );
};

export default IssueCard;
