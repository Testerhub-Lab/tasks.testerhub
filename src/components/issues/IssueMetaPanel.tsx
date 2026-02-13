"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateTaskFieldsAction } from "../../server/actions/tasks";
import { Priority, Status } from "@prisma/client";
import { formatDate } from "./utils";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";

const statusLabel: Record<Status, string> = {
  [Status.NEW]: "New",
  [Status.TODO]: "To Do",
  [Status.HOLD]: "Hold",
  [Status.IN_PROGRESS]: "In Progress",
  [Status.TESTING]: "Testing",
  [Status.DONE]: "Done",
  [Status.REJECT]: "Reject",
};

const priorityLabel: Record<Priority, string> = {
  [Priority.LOW]: "Low",
  [Priority.MEDIUM]: "Medium",
  [Priority.HIGH]: "High",
  [Priority.CRITICAL]: "Critical",
};

interface IssueMetaPanelProps {
  id: string;
  projectLabel?: string | null;
  status?: Status | null;
  priority?: Priority | null;
  environment?: string | null;
  reporterName?: string | null;
  assigneeId?: string | null;
  users: Array<{ id: string; name: string | null; email: string }>;
  createdAt: Date | string;
  updatedAt?: Date | string | null;
}

const IssueMetaPanel: React.FC<IssueMetaPanelProps> = ({
  id,
  status,
  projectLabel,
  priority,
  environment,
  reporterName,
  assigneeId,
  users,
  createdAt,
  updatedAt,
}) => {
  const router = useRouter();
  const currentAssigneeMeta = users.find((u) => u.id === assigneeId) ?? null;
  const assigneeLabel = currentAssigneeMeta?.name ?? currentAssigneeMeta?.email ?? "Unassigned";
  const assigneeInitials = assigneeLabel
    ? assigneeLabel
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("")
    : "";
  const [openMenu, setOpenMenu] = useState<"assignee" | "status" | "priority" | null>(null);
  const assigneeRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const priorityRef = useRef<HTMLDivElement | null>(null);

  const statusOptions = useMemo(
    () =>
      (Object.values(Status) as Status[]).map((s) => ({
        value: s,
        label: statusLabel[s] ?? s,
      })),
    []
  );

  const priorityOptions = useMemo(
    () =>
      (Object.values(Priority) as Priority[]).map((p) => ({
        value: p,
        label: priorityLabel[p] ?? p,
      })),
    []
  );

  const [currentStatus, setCurrentStatus] = useState<Status>(status ?? Status.NEW);
  const [currentPriority, setCurrentPriority] = useState<Priority>(
    priority ?? Priority.MEDIUM
  );
  const [currentAssignee, setCurrentAssignee] = useState<string>(
    assigneeId ?? ""
  );
  const [isSaving, setSaving] = useState(false);

  React.useEffect(() => {
    setCurrentAssignee(assigneeId ?? "");
  }, [assigneeId]);

  React.useEffect(() => {
    if (!openMenu) return;
    const handleClick = (event: MouseEvent) => {
      const activeRef =
        openMenu === "assignee"
          ? assigneeRef
          : openMenu === "status"
          ? statusRef
          : openMenu === "priority"
          ? priorityRef
          : null;
      if (!activeRef?.current) return;
      if (!activeRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [openMenu]);

  const handleUpdate = async (next: {
    status?: Status;
    priority?: Priority;
    assigneeId?: string | null;
  }) => {
    setSaving(true);
    try {
      const result = await updateTaskFieldsAction({
        id,
        status: next.status ?? currentStatus,
        priority: next.priority ?? currentPriority,
        assigneeId:
          typeof next.assigneeId !== "undefined"
            ? next.assigneeId
            : currentAssignee || null,
      });
      if (!result.ok) {
        if (isAuthRequiredError({ formError: result.formError ?? null })) {
          showAuthRequiredToast();
        }
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const priorityLevel = (() => {
    if (!currentPriority) return 0;
    switch (currentPriority) {
      case Priority.CRITICAL:
        return 4;
      case Priority.HIGH:
        return 3;
      case Priority.MEDIUM:
        return 2;
      case Priority.LOW:
        return 1;
      default:
        return 0;
    }
  })();

  return (
    <div className="space-y-3 rounded-2xl border border-white/6 bg-white/[0.02] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/70">Properties</h3>
        {isSaving ? (
          <span className="text-xs text-white/50">Saving...</span>
        ) : null}
      </div>

      <div className="space-y-1 text-xs text-white/60">
        {projectLabel ? (
          <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/4">
            <div className="flex items-center gap-2 text-white/60">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 7h18" />
                <path d="M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
                <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Project</span>
            </div>
            <span className="text-sm text-white/80">{projectLabel}</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/4">
          <div className="flex items-center gap-2 text-white/60">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 21a8 8 0 1 0-16 0" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Assignee</span>
          </div>
          <div className="relative" ref={assigneeRef}>
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === "assignee" ? null : "assignee")}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-white/85 hover:bg-white/6"
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold ${
                  currentAssigneeMeta
                    ? "bg-white/6 border-white/10 text-white/80"
                    : "bg-white/4 border-white/8 text-white/35"
                }`}
                title={assigneeLabel}
              >
                {assigneeInitials || "—"}
              </span>
              <span className="min-w-[120px] text-right">{assigneeLabel}</span>
            </button>
            {openMenu === "assignee" ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-lg border border-white/10 bg-[rgba(6,10,20,0.92)] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                  onClick={() => {
                    setOpenMenu(null);
                    setCurrentAssignee("");
                    handleUpdate({ assigneeId: null });
                  }}
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-white/60">
                    —
                  </span>
                  <span>Unassigned</span>
                </button>
                {users.map((u) => {
                  const label = u.name ?? u.email;
                  const initials = label
                    ? label
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase())
                        .join("")
                    : "";
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                      onClick={() => {
                        setOpenMenu(null);
                        setCurrentAssignee(u.id);
                        handleUpdate({ assigneeId: u.id });
                      }}
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-white/70">
                        {initials || "—"}
                      </span>
                      <span className="truncate">{label ?? "Unknown"}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {reporterName ? (
          <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/4">
            <div className="flex items-center gap-2 text-white/60">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 20v-6" />
                <path d="M6 20v-4" />
                <path d="M18 20v-8" />
                <path d="M4 8l8-4 8 4" />
              </svg>
              <span>Reporter</span>
            </div>
            <span className="text-sm text-white/80">{reporterName}</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/4">
          <div className="flex items-center gap-2 text-white/60">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h10" />
            </svg>
            <span>Status</span>
          </div>
          <div className="relative" ref={statusRef}>
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === "status" ? null : "status")}
              className="flex min-w-[160px] items-center justify-end gap-2 rounded-md px-2 py-1 text-sm text-white/85 hover:bg-white/6"
            >
              <span>{statusLabel[currentStatus] ?? currentStatus}</span>
            </button>
            {openMenu === "status" ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-lg border border-white/10 bg-[rgba(6,10,20,0.92)] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur">
                {statusOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                    onClick={() => {
                      setOpenMenu(null);
                      setCurrentStatus(opt.value);
                      handleUpdate({ status: opt.value });
                    }}
                  >
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/4">
          <div className="flex items-center gap-2 text-white/60">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 12h4" />
              <path d="M9 12h4" />
              <path d="M15 12h6" />
            </svg>
            <span>Priority</span>
          </div>
          <div className="relative" ref={priorityRef}>
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === "priority" ? null : "priority")}
              className="flex min-w-[160px] items-center justify-end gap-2 rounded-md px-2 py-1 text-sm text-white/85 hover:bg-white/6"
            >
              <span className="inline-flex items-end gap-1 text-white/70">
                {Array.from({ length: 4 }).map((_, index) => {
                  const level = index + 1;
                  return (
                    <span
                      key={level}
                      className={`block w-[3px] rounded-[2px] bg-white ${
                        level <= priorityLevel ? "opacity-90" : "opacity-20"
                      }`}
                      style={{ height: 6 + level * 2 }}
                    />
                  );
                })}
              </span>
              <span>{priorityLabel[currentPriority] ?? currentPriority}</span>
            </button>
            {openMenu === "priority" ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-lg border border-white/10 bg-[rgba(6,10,20,0.92)] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur">
                {priorityOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                    onClick={() => {
                      setOpenMenu(null);
                      setCurrentPriority(opt.value);
                      handleUpdate({ priority: opt.value });
                    }}
                  >
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {environment ? (
          <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/4">
            <div className="flex items-center gap-2 text-white/60">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2v4" />
                <path d="M12 18v4" />
                <path d="M4.93 4.93l2.83 2.83" />
                <path d="M16.24 16.24l2.83 2.83" />
                <path d="M2 12h4" />
                <path d="M18 12h4" />
                <path d="M4.93 19.07l2.83-2.83" />
                <path d="M16.24 7.76l2.83-2.83" />
              </svg>
              <span>Environment</span>
            </div>
            <span className="text-sm text-white/80">{environment}</span>
          </div>
        ) : null}

        <div className="my-2 border-t border-white/10" />

        <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2">
          <div className="flex items-center gap-2 text-white/60">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
            <span>Created</span>
          </div>
          <span className="text-sm text-white/75">{formatDate(createdAt)}</span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2">
          <div className="flex items-center gap-2 text-white/60">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2v6" />
              <path d="M6 8h12" />
              <path d="M5 10v10h14V10" />
            </svg>
            <span>Updated</span>
          </div>
          <span className="text-sm text-white/75">
            {formatDate(updatedAt ?? createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default IssueMetaPanel;
