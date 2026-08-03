import {
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from "@/shared/taskEnums";

// -------- Status

export const getStatusLabel = (status?: TaskStatus | null) =>
  status ? TASK_STATUS_LABEL[status] ?? "—" : "—";

// -------- Priority

export const getPriorityLabel = (priority?: TaskPriority | null) =>
  priority ? TASK_PRIORITY_LABEL[priority] ?? "—" : "—";

export const getPriorityClasses = (priority?: TaskPriority | null) => {
  switch (priority) {
    case "CRITICAL":
      return "border-red-400/40 text-red-200 bg-red-500/10";
    case "HIGH":
      return "border-orange-400/40 text-orange-200 bg-orange-500/10";
    case "MEDIUM":
      return "border-amber-400/40 text-amber-200 bg-amber-500/10";
    case "LOW":
      return "border-emerald-400/40 text-emerald-200 bg-emerald-500/10";
    default:
      return "border-[var(--color-card-border)] text-[var(--color-text-secondary)] bg-[var(--color-card-bg)]";
  }
};

// -------- Date

export const formatDate = (value?: Date | string | null) => {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
};
