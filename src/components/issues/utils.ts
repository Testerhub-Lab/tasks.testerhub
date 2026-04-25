import { Priority, Status } from "@prisma/client";

// -------- Status (канон: только Prisma enum)

export const getStatusLabel = (status?: Status | null) => {
  switch (status) {
    case Status.NEW:
      return "New";
    case Status.TODO:
      return "To Do";
    case Status.HOLD:
      return "Hold";
    case Status.IN_PROGRESS:
      return "In Progress";
    case Status.TESTING:
      return "Testing";
    case Status.DONE:
      return "Done";
    case Status.REJECT:
      return "Reject";
    default:
      return "—";
  }
};

// -------- Priority (канон: только Prisma enum)

export const getPriorityLabel = (priority?: Priority | null) => {
  switch (priority) {
    case Priority.CRITICAL:
      return "Critical";
    case Priority.HIGH:
      return "High";
    case Priority.MEDIUM:
      return "Medium";
    case Priority.LOW:
      return "Low";
    default:
      return "—";
  }
};

export const getPriorityClasses = (priority?: Priority | null) => {
  switch (priority) {
    case Priority.CRITICAL:
      return "border-red-400/40 text-red-200 bg-red-500/10";
    case Priority.HIGH:
      return "border-orange-400/40 text-orange-200 bg-orange-500/10";
    case Priority.MEDIUM:
      return "border-amber-400/40 text-amber-200 bg-amber-500/10";
    case Priority.LOW:
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
