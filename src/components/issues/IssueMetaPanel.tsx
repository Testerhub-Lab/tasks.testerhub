"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Select from "../ui/Select";
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
  assigneeName?: string | null;
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
  assigneeName,
  users,
  createdAt,
  updatedAt,
}) => {
  const router = useRouter();

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

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--divider)] bg-[var(--color-card-bg)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/70">Details</h3>
        {isSaving ? (
          <span className="text-xs text-[var(--color-text-secondary)]">Saving...</span>
        ) : null}
      </div>

      <div className="space-y-2 text-xs text-[var(--color-text-secondary)]">
        {projectLabel ? (
          <div className="flex items-center justify-between gap-3">
            <span className="w-24 text-white/60">Project</span>
            <span className="text-sm text-[var(--color-text)]">{projectLabel}</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <span className="w-24 text-white/60">Assignee</span>
          <Select
            name="assignee"
            value={currentAssignee}
            onChange={(event) => {
              const nextAssignee = event.target.value;
              setCurrentAssignee(nextAssignee);
              handleUpdate({ assigneeId: nextAssignee || null });
            }}
            className="h-8 text-xs"
            options={[
              { value: "", label: "Unassigned" },
              ...users.map((u) => ({
                value: u.id,
                label: u.name ? u.name : u.email,
              })),
            ]}
          />
        </div>

        {reporterName ? (
          <div className="flex items-center justify-between gap-3">
            <span className="w-24 text-white/60">Reporter</span>
            <span className="text-sm text-[var(--color-text)]">{reporterName}</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <span className="w-24 text-white/60">Status</span>
          <Select
            name="status"
            value={currentStatus}
            onChange={(event) => {
              const nextStatus = event.target.value as Status;
              setCurrentStatus(nextStatus);
              handleUpdate({ status: nextStatus });
            }}
            className="h-8 text-xs"
            options={statusOptions}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="w-24 text-white/60">Priority</span>
          <Select
            name="priority"
            value={currentPriority}
            onChange={(event) => {
              const nextPriority = event.target.value as Priority;
              setCurrentPriority(nextPriority);
              handleUpdate({ priority: nextPriority });
            }}
            className="h-8 text-xs"
            options={priorityOptions}
          />
        </div>

        {environment ? (
          <div className="flex items-center justify-between gap-3">
            <span className="w-24 text-white/60">Environment</span>
            <span className="text-sm text-[var(--color-text)]">{environment}</span>
          </div>
        ) : null}

        <div className="mt-2 border-t border-white/10" />

        <div className="flex items-center justify-between gap-3">
          <span className="w-24 text-white/60">Created</span>
          <span className="text-sm text-[var(--color-text)]">{formatDate(createdAt)}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="w-24 text-white/60">Updated</span>
          <span className="text-sm text-[var(--color-text)]">
            {formatDate(updatedAt ?? createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default IssueMetaPanel;
