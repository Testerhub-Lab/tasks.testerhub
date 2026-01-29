import type { TaskPriority, TaskStatus } from "../../server/validators/task";

const statusLabelMap: Record<string, TaskStatus> = {
  new: "New",
  open: "New",
  backlog: "New",

  todo: "Todo",
  to_do: "Todo",

  in_progress: "In Progress",
  progress: "In Progress",

  testing: "Testing",
  qa: "Testing",
  review: "Testing",

  done: "Done",
  closed: "Done",
  resolved: "Done",
};

export const normalizeStatus = (status?: string | null): TaskStatus => {
  if (!status) return "New";
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  return statusLabelMap[normalized] ?? "New";
};

const statusUiLabels: Record<TaskStatus, string> = {
  New: "New",
  Todo: "To Do",
  "In Progress": "In Progress",
  Testing: "Testing",
  Done: "Done",
};

export const getStatusLabel = (status?: string | null) => {
  return statusUiLabels[normalizeStatus(status)];
};

export const normalizePriority = (
  priority?: string | null
): TaskPriority | null => {
  if (!priority) {
    return null;
  }
  const normalized = priority.toLowerCase();
  switch (normalized) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return null;
  }
};

export const getPriorityClasses = (priority?: TaskPriority | null) => {
  switch (priority) {
    case "Critical":
      return "border-red-400/40 text-red-200 bg-red-500/10";
    case "High":
      return "border-orange-400/40 text-orange-200 bg-orange-500/10";
    case "Medium":
      return "border-amber-400/40 text-amber-200 bg-amber-500/10";
    case "Low":
      return "border-emerald-400/40 text-emerald-200 bg-emerald-500/10";
    default:
      return "border-[var(--color-card-border)] text-[var(--color-text-secondary)] bg-[var(--color-card-bg)]";
  }
};

export const formatDate = (value?: Date | string | null) => {
  if (!value) {
    return "—";
  }
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
};
