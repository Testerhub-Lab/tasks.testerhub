export const ISSUE_FILTER_QUERY_KEYS = [
  "q",
  "projectId",
  "status",
  "priority",
  "tags",
  "assignee",
] as const;

export type IssueFilterQueryKey = (typeof ISSUE_FILTER_QUERY_KEYS)[number];
