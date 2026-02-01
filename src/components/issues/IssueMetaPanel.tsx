"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Select from "../ui/Select";
import { updateTaskFieldsAction } from "../../server/actions/tasks";
import { Priority, Status } from "@prisma/client";
import { formatDate } from "./utils";

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
  const [isSaving, setSaving] = useState(false);

  const handleUpdate = async (next: { status?: Status; priority?: Priority }) => {
    setSaving(true);
    try {
      const result = await updateTaskFieldsAction({
        id,
        status: next.status ?? currentStatus,
        priority: next.priority ?? currentPriority,
      });
      if (!result.ok) return;
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--divider)] bg-[var(--color-card-bg)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/70">
          Details
        </h3>
        {isSaving ? (
          <span className="text-xs text-[var(--color-text-secondary)]">Saving...</span>
        ) : null}
      </div>

      {projectLabel ? (
        <div className="space-y-1">
          <div className="text-xs text-[var(--color-text-secondary)]">Project</div>
          <div className="text-sm text-[var(--color-text)]">{projectLabel}</div>
        </div>
      ) : null}

      <label className="space-y-2 text-xs text-[var(--color-text-secondary)]">
        <span className="font-medium text-white">Status</span>
        <Select
          name="status"
          value={currentStatus}
          onChange={(event) => {
            const nextStatus = event.target.value as Status;
            setCurrentStatus(nextStatus);
            handleUpdate({ status: nextStatus });
          }}
          options={statusOptions}
        />
      </label>

      <label className="space-y-2 text-xs text-[var(--color-text-secondary)]">
        <span className="font-medium text-white">Priority</span>
        <Select
          name="priority"
          value={currentPriority}
          onChange={(event) => {
            const nextPriority = event.target.value as Priority;
            setCurrentPriority(nextPriority);
            handleUpdate({ priority: nextPriority });
          }}
          options={priorityOptions}
        />
      </label>

      {environment ? (
        <div className="space-y-1">
          <div className="text-xs text-[var(--color-text-secondary)]">Environment</div>
          <div className="text-sm text-[var(--color-text)]">{environment}</div>
        </div>
      ) : null}

      {reporterName ? (
        <div className="space-y-1">
          <div className="text-xs text-[var(--color-text-secondary)]">Reporter</div>
          <div className="text-sm text-[var(--color-text)]">{reporterName}</div>
        </div>
      ) : null}

      <div className="my-2 border-t border-white/10" />

      <div className="space-y-3">
        <div className="space-y-1">
          <div className="text-xs text-[var(--color-text-secondary)]">Created</div>
          <div className="text-sm text-[var(--color-text)]">{formatDate(createdAt)}</div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-[var(--color-text-secondary)]">Updated</div>
          <div className="text-sm text-[var(--color-text)]">
            {formatDate(updatedAt ?? createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IssueMetaPanel;
