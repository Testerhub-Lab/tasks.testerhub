import type { IssueViewPath } from "./issueNavigation";

export type IssueViewLayout = "board" | "list";
export type IssueViewScope = "all" | "project" | "my";

export type IssueViewPreference = {
  scope: IssueViewScope;
  projectId: string | null;
  layout: IssueViewLayout;
};

export type IssueViewPreferenceInput = {
  scope: IssueViewScope;
  projectId?: string | null;
  layout: IssueViewLayout;
};

export const DEFAULT_ISSUE_VIEW_LAYOUT: IssueViewLayout = "board";

export function issueViewLayoutToPath(layout: IssueViewLayout): IssueViewPath {
  return layout === "list" ? "/issues" : "/board";
}

export function issueViewPathToLayout(path: string): IssueViewLayout | null {
  if (path.startsWith("/board") || /^\/[^/]+\/board(?:\/|$)/.test(path)) {
    return "board";
  }
  if (path.startsWith("/issues") || /^\/[^/]+\/issues(?:\/|$)/.test(path)) {
    return "list";
  }
  return null;
}

export function resolveIssueViewScope(input: {
  projectId?: string | null;
  assignee?: string | null;
}): { scope: IssueViewScope; projectId: string | null } {
  const projectId = input.projectId?.trim() || null;
  if (input.assignee === "me") {
    return { scope: "my", projectId };
  }
  if (projectId) {
    return { scope: "project", projectId };
  }
  return { scope: "all", projectId: null };
}

function preferenceKey(scope: IssueViewScope, projectId: string | null) {
  return `${scope}:${projectId ?? ""}`;
}

export function resolveIssueViewLayout(
  input: {
    scope: IssueViewScope;
    projectId?: string | null;
  },
  preferences: readonly IssueViewPreference[] = []
) {
  const projectId = input.projectId?.trim() || null;
  const exact = preferences.find(
    (preference) =>
      preferenceKey(preference.scope, preference.projectId) ===
      preferenceKey(input.scope, projectId)
  );
  if (exact) return exact.layout;

  if (input.scope === "my" && projectId) {
    const globalMy = preferences.find(
      (preference) =>
        preferenceKey(preference.scope, preference.projectId) ===
        preferenceKey("my", null)
    );
    if (globalMy) return globalMy.layout;
  }

  return DEFAULT_ISSUE_VIEW_LAYOUT;
}

export function resolveIssueViewPath(
  input: {
    scope: IssueViewScope;
    projectId?: string | null;
  },
  preferences: readonly IssueViewPreference[] = []
) {
  return issueViewLayoutToPath(resolveIssueViewLayout(input, preferences));
}

export function resolveIssueViewPathWithPrecedence(
  input: {
    explicitPath?: string | null;
    scope: IssueViewScope;
    projectId?: string | null;
  },
  preferences: readonly IssueViewPreference[] = []
) {
  const explicitLayout = input.explicitPath
    ? issueViewPathToLayout(input.explicitPath)
    : null;
  return issueViewLayoutToPath(
    explicitLayout ?? resolveIssueViewLayout(input, preferences)
  );
}
