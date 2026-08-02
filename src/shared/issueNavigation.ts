import { ISSUE_FILTER_QUERY_KEYS } from "./issueFilterQueryKeys";

export type IssueViewPath = "/board" | "/issues" | "/backlog";
export type IssueViewSource = "board" | "list" | "backlog";

export const DEFAULT_ISSUE_VIEW_PATH: IssueViewPath = "/board";

type QueryInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

const BOARD_LIMIT_QUERY_KEYS = [
  "todoLimit",
  "inProgressLimit",
  "testingLimit",
  "doneLimit",
] as const;

const CONTEXT_QUERY_KEYS = [
  ...ISSUE_FILTER_QUERY_KEYS,
  ...BOARD_LIMIT_QUERY_KEYS,
] as const;

function appendValue(params: URLSearchParams, key: string, value: string) {
  const trimmed = value.trim();
  if (trimmed) params.append(key, trimmed);
}

export function queryInputToParams(input: QueryInput) {
  if (input instanceof URLSearchParams) {
    return new URLSearchParams(input.toString());
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) appendValue(params, key, item);
    } else if (value) {
      appendValue(params, key, value);
    }
  }
  return params;
}

export function issueContextParams(input: QueryInput) {
  const source = queryInputToParams(input);
  const params = new URLSearchParams();
  for (const key of CONTEXT_QUERY_KEYS) {
    for (const value of source.getAll(key)) appendValue(params, key, value);
  }
  return params;
}

export function buildIssueViewHref(path: IssueViewPath, input: QueryInput) {
  const params = issueContextParams(input);
  params.delete("page");
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function buildIssueDetailHref(
  ref: string,
  input: QueryInput,
  options: {
    projectId?: string | null;
    from?: IssueViewSource;
  } = {}
) {
  const params = issueContextParams(input);
  if (options.projectId) params.set("projectId", options.projectId);
  if (options.from) params.set("from", options.from);
  const query = params.toString();
  return query
    ? `/tasks/${encodeURIComponent(ref)}?${query}`
    : `/tasks/${encodeURIComponent(ref)}`;
}

export function clearIssueFiltersHref(path: IssueViewPath, input: QueryInput) {
  const source = queryInputToParams(input);
  const params = new URLSearchParams();
  const projectId = source.get("projectId");
  const pageSize = source.get("pageSize");
  if (projectId) params.set("projectId", projectId);
  if (pageSize) params.set("pageSize", pageSize);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
