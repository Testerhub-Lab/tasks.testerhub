import { z } from "zod";
import { taskStatusSchema } from "./task";
import {
  BOARD_COLUMN_LIMIT_DEFAULT,
  BOARD_COLUMN_LIMIT_MAX,
  BOARD_COLUMN_LIMIT_PARAM,
  BOARD_COLUMN_STATUSES,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  resolveBoardColumnStatuses,
  type BoardColumnLimits,
  type BoardColumnStatus,
  type IssueFilterPriority,
  type IssueFilterStatus,
  type IssueFilters,
  type IssuePageSize,
} from "../../shared/issueFilterConfig";

const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const viewSchema = z.enum(["board", "backlog", "issues"]);

const normalizeString = (value?: string | string[] | null) => {
  if (!value) return undefined;
  const text = Array.isArray(value) ? value[0] : value;
  const trimmed = text.trim();
  return trimmed.length ? trimmed : undefined;
};

const normalizeArray = (value?: string | string[] | null) => {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const issueFiltersSchema = z.object({
  q: z.string().max(120).optional(),
  status: z.array(taskStatusSchema).optional(),
  priority: z.array(prioritySchema).optional(),
  tags: z.array(z.string().max(24)).max(20).optional(),
  projectId: z.string().min(1).optional(),
  assignee: z.string().min(1).max(64).optional(),
  view: viewSchema.optional(),
});

export type {
  BoardColumnLimits,
  BoardColumnStatus,
  IssueFilterPriority,
  IssueFilters,
  IssueFilterStatus,
  IssuePageSize,
};
export {
  BOARD_COLUMN_LIMIT_DEFAULT,
  BOARD_COLUMN_LIMIT_MAX,
  BOARD_COLUMN_LIMIT_PARAM,
  BOARD_COLUMN_STATUSES,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  resolveBoardColumnStatuses,
};

export type IssuePaginationInput = {
  page: number;
  pageSize: IssuePageSize;
};

const firstParamValue = (value?: string | string[] | null) =>
  Array.isArray(value) ? value[0] : value;

const positiveIntegerParam = (value?: string | string[] | null) => {
  const text = firstParamValue(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const parseSearchParams = (
  searchParams: Record<string, string | string[] | undefined>
): IssueFilters => {
  const parseEnumArray = <T extends string>(
    values: string[],
    schema: z.ZodType<T>
  ) => {
    const parsed: T[] = [];
    for (const value of values) {
      const result = schema.safeParse(value);
      if (result.success) {
        parsed.push(result.data);
      }
    }
    return parsed;
  };

  const normalizedTags = normalizeArray(searchParams.tags)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && tag.length <= 24)
    .slice(0, 20);

  const raw = {
    q: normalizeString(searchParams.q),
    status: parseEnumArray(
      normalizeArray(searchParams.status),
      taskStatusSchema
    ),
    priority: parseEnumArray(
      normalizeArray(searchParams.priority),
      prioritySchema
    ),
    tags: normalizedTags,
    projectId: normalizeString(searchParams.projectId),
    assignee: normalizeString(searchParams.assignee),
    view: normalizeString(searchParams.view),
  };

  const parsed = issueFiltersSchema.safeParse({
    ...raw,
    status: raw.status.length ? raw.status : undefined,
    priority: raw.priority.length ? raw.priority : undefined,
    tags: raw.tags.length ? raw.tags : undefined,
  });

  if (!parsed.success) {
    return {
      q: raw.q,
      status: raw.status.length ? raw.status : undefined,
      priority: raw.priority.length ? raw.priority : undefined,
      tags: raw.tags.length ? raw.tags : undefined,
      projectId: raw.projectId,
      assignee: raw.assignee,
      view: raw.view as IssueFilters["view"],
    };
  }

  return parsed.data;
};

export const hasActiveFilters = (filters: IssueFilters) => {
  return Boolean(
    (filters.q && filters.q.length) ||
      (filters.status && filters.status.length) ||
      (filters.priority && filters.priority.length) ||
      (filters.tags && filters.tags.length) ||
      filters.projectId
      || filters.assignee
  );
};

export const parsePaginationParams = (
  searchParams: Record<string, string | string[] | undefined>
): IssuePaginationInput => {
  const requestedPage = positiveIntegerParam(searchParams.page);
  const requestedPageSize = positiveIntegerParam(searchParams.pageSize);
  const pageSize = PAGE_SIZE_OPTIONS.includes(
    requestedPageSize as IssuePageSize
  )
    ? (requestedPageSize as IssuePageSize)
    : DEFAULT_PAGE_SIZE;

  return {
    page: requestedPage ?? 1,
    pageSize,
  };
};

export const parseBoardColumnLimitParams = (
  searchParams: Record<string, string | string[] | undefined>
): BoardColumnLimits => {
  const limits = {} as BoardColumnLimits;
  for (const status of BOARD_COLUMN_STATUSES) {
    const requested = positiveIntegerParam(
      searchParams[BOARD_COLUMN_LIMIT_PARAM[status]]
    );
    limits[status] = requested
      ? Math.min(
          Math.max(requested, BOARD_COLUMN_LIMIT_DEFAULT),
          BOARD_COLUMN_LIMIT_MAX
        )
      : BOARD_COLUMN_LIMIT_DEFAULT;
  }
  return limits;
};
