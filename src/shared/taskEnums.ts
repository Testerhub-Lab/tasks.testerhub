export const TASK_STATUS_VALUES = [
  "NEW",
  "TODO",
  "HOLD",
  "IN_PROGRESS",
  "TESTING",
  "DONE",
  "REJECT",
] as const;

export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

export const TASK_PRIORITY_VALUES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export type TaskPriority = (typeof TASK_PRIORITY_VALUES)[number];

export const DEFAULT_TASK_STATUS: TaskStatus = "NEW";
export const DEFAULT_TASK_PRIORITY: TaskPriority = "MEDIUM";

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  NEW: "New",
  TODO: "To Do",
  HOLD: "Hold",
  IN_PROGRESS: "In Progress",
  TESTING: "Testing",
  DONE: "Done",
  REJECT: "Reject",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

