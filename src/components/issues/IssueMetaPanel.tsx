"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Select from "../ui/Select";
import { updateTaskFieldsAction } from "../../server/actions/tasks";
import type { TaskPriority, TaskStatus } from "../../server/validators/task";
import { formatDate, normalizePriority, normalizeStatus } from "./utils";

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: "New", label: "New" },
  { value: "In Progress", label: "In Progress" },
  { value: "Testing", label: "Testing" },
  { value: "Done", label: "Done" },
];

const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Critical", label: "Critical" },
];

interface IssueMetaPanelProps {
  id: string;
  status?: string | null;
  priority?: string | null;
  environment?: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string | null;
}

const IssueMetaPanel: React.FC<IssueMetaPanelProps> = ({
  id,
  status,
  priority,
  environment,
  createdAt,
  updatedAt,
}) => {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState<TaskStatus>(
    normalizeStatus(status)
  );
  const [currentPriority, setCurrentPriority] = useState<TaskPriority>(
    normalizePriority(priority) ?? "Medium"
  );
  const [isSaving, setSaving] = useState(false);

  const handleUpdate = async (next: { status?: TaskStatus; priority?: TaskPriority }) => {
    setSaving(true);
    try {
      const result = await updateTaskFieldsAction({
        id,
        status: next.status ?? currentStatus,
        priority: next.priority ?? currentPriority,
      });
      if (!result.ok) {
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Details
        </h3>
        {isSaving ? (
          <span className="text-xs text-[var(--color-text-secondary)]">
            Saving...
          </span>
        ) : null}
      </div>
      <label className="space-y-2 text-xs text-[var(--color-text-secondary)]">
        <span className="font-medium text-white">Status</span>
        <Select
          name="status"
          value={currentStatus}
          onChange={(event) => {
            const nextStatus = event.target.value as TaskStatus;
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
            const nextPriority = event.target.value as TaskPriority;
            setCurrentPriority(nextPriority);
            handleUpdate({ priority: nextPriority });
          }}
          options={priorityOptions}
        />
      </label>
      {environment ? (
        <div className="space-y-1 text-xs text-[var(--color-text-secondary)]">
          <span className="font-medium text-white">Environment</span>
          <div>{environment}</div>
        </div>
      ) : null}
      <div className="space-y-1 text-xs text-[var(--color-text-secondary)]">
        <span className="font-medium text-white">Created</span>
        <div>{formatDate(createdAt)}</div>
      </div>
      <div className="space-y-1 text-xs text-[var(--color-text-secondary)]">
        <span className="font-medium text-white">Updated</span>
        <div>{formatDate(updatedAt ?? createdAt)}</div>
      </div>
    </div>
  );
};

export default IssueMetaPanel;
