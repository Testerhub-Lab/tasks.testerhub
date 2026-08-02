import type { IssueViewPath } from "./issueNavigation";

export type ProjectKeyRoute = {
  id: string;
  key: string;
};

const PROJECT_VIEW_SEGMENTS = new Set(["board", "issues", "backlog"]);

export function projectKeyPathSegment(projectKey: string) {
  return projectKey.trim().toLowerCase();
}

export function buildProjectIssueViewPath(
  projectKey: string,
  path: IssueViewPath
) {
  return `/${projectKeyPathSegment(projectKey)}${path}`;
}

export function buildProjectIssueDetailPath(projectKey: string, ref: string) {
  return `/${projectKeyPathSegment(projectKey)}/issues/${encodeURIComponent(ref)}`;
}

export function getProjectKeyFromPathname(pathname: string) {
  const [, rawProjectKey, rawView] = pathname.split("/");
  if (!rawProjectKey || !rawView || !PROJECT_VIEW_SEGMENTS.has(rawView)) {
    return null;
  }
  return rawProjectKey;
}

export function findProjectByRouteContext(
  projects: readonly ProjectKeyRoute[],
  input: {
    pathname: string;
    projectId?: string | null;
  }
) {
  if (input.projectId) {
    return projects.find((project) => project.id === input.projectId) ?? null;
  }

  const projectKey = getProjectKeyFromPathname(input.pathname);
  if (!projectKey) return null;
  const normalized = projectKey.toUpperCase();
  return (
    projects.find((project) => project.key.toUpperCase() === normalized) ?? null
  );
}

export function removeProjectIdParam(input: URLSearchParams) {
  const params = new URLSearchParams(input.toString());
  params.delete("projectId");
  return params;
}
