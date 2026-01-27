import { z } from "zod";
import { taskStatusSchema } from "./task";
import type { TaskPriority, TaskStatus } from "./task";

const prioritySchema = z.enum(["Low", "Medium", "High", "Critical"]);
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
  view: viewSchema.optional(),
});

export type IssueFilters = z.infer<typeof issueFiltersSchema>;
export type IssueFilterStatus = TaskStatus;
export type IssueFilterPriority = TaskPriority;

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
  );
};
