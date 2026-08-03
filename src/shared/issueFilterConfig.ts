import type { TaskPriority, TaskStatus } from "./taskEnums";

export type IssueFilters = {
  q?: string;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  tags?: string[];
  projectId?: string;
  assignee?: string;
  view?: "board" | "backlog" | "issues";
};

export type IssueFilterStatus = TaskStatus;
export type IssueFilterPriority = TaskPriority;

export const PAGE_SIZE_OPTIONS = [10, 15, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 20;

export type IssuePageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export const BOARD_COLUMN_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "TESTING",
  "DONE",
] as const;

export type BoardColumnStatus = (typeof BOARD_COLUMN_STATUSES)[number];

export const BOARD_COLUMN_LIMIT_DEFAULT = 20;
export const BOARD_COLUMN_LIMIT_MAX = 50;

export type BoardColumnLimits = Record<BoardColumnStatus, number>;

export const BOARD_COLUMN_LIMIT_PARAM: Record<BoardColumnStatus, string> = {
  TODO: "todoLimit",
  IN_PROGRESS: "inProgressLimit",
  TESTING: "testingLimit",
  DONE: "doneLimit",
};

export const resolveBoardColumnStatuses = (
  filters: Pick<IssueFilters, "status">
): BoardColumnStatus[] => {
  if (!filters.status?.length) return [...BOARD_COLUMN_STATUSES];
  return BOARD_COLUMN_STATUSES.filter((status) =>
    filters.status?.includes(status)
  );
};

