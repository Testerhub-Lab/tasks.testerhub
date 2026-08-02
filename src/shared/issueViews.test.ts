import { describe, expect, it } from "vitest";
import {
  DEFAULT_ISSUE_VIEW_LAYOUT,
  issueViewLayoutToPath,
  issueViewPathToLayout,
  resolveIssueViewLayout,
  resolveIssueViewPath,
  resolveIssueViewPathWithPrecedence,
  resolveIssueViewScope,
  type IssueViewPreference,
} from "./issueViews";

const projectId = "1c25b25b-7797-49af-8f76-8c7969822909";

const preferences: IssueViewPreference[] = [
  { scope: "all", projectId: null, layout: "list" },
  { scope: "project", projectId, layout: "list" },
  { scope: "my", projectId: null, layout: "board" },
];

describe("issue views", () => {
  it("maps layouts to existing issue routes", () => {
    expect(DEFAULT_ISSUE_VIEW_LAYOUT).toBe("board");
    expect(issueViewLayoutToPath("board")).toBe("/board");
    expect(issueViewLayoutToPath("list")).toBe("/issues");
    expect(issueViewPathToLayout("/board?projectId=1")).toBe("board");
    expect(issueViewPathToLayout("/pulsar/board")).toBe("board");
    expect(issueViewPathToLayout("/issues")).toBe("list");
    expect(issueViewPathToLayout("/pulsar/issues/PULSAR-30")).toBe("list");
    expect(issueViewPathToLayout("/backlog")).toBeNull();
  });

  it("resolves all, project and my scopes from URL context", () => {
    expect(resolveIssueViewScope({})).toEqual({
      scope: "all",
      projectId: null,
    });
    expect(resolveIssueViewScope({ projectId })).toEqual({
      scope: "project",
      projectId,
    });
    expect(resolveIssueViewScope({ assignee: "me", projectId })).toEqual({
      scope: "my",
      projectId,
    });
  });

  it("uses exact server-backed preference before product default", () => {
    expect(resolveIssueViewLayout({ scope: "project", projectId }, preferences))
      .toBe("list");
    expect(resolveIssueViewPath({ scope: "project", projectId }, preferences))
      .toBe("/issues");
    expect(resolveIssueViewPath({ scope: "project", projectId: "other" }, preferences))
      .toBe("/board");
  });

  it("falls back from project-scoped my preference to global my preference", () => {
    expect(resolveIssueViewLayout({ scope: "my", projectId }, preferences))
      .toBe("board");
  });

  it("keeps explicit URL route above server preference and default", () => {
    expect(
      resolveIssueViewPathWithPrecedence(
        { explicitPath: "/board", scope: "project", projectId },
        preferences
      )
    ).toBe("/board");
    expect(
      resolveIssueViewPathWithPrecedence(
        { explicitPath: null, scope: "project", projectId },
        preferences
      )
    ).toBe("/issues");
  });
});
