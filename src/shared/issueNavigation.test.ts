import { describe, expect, it } from "vitest";
import {
  DEFAULT_ISSUE_VIEW_PATH,
  buildIssueDetailHref,
  buildIssueViewHref,
  clearIssueFiltersHref,
} from "./issueNavigation";

describe("issue navigation", () => {
  it("defaults issue navigation to the board view", () => {
    expect(DEFAULT_ISSUE_VIEW_PATH).toBe("/board");
  });

  it("preserves project context when switching between board and list", () => {
    const params = new URLSearchParams("projectId=project-1&q=bug&page=3");

    expect(buildIssueViewHref("/board", params)).toBe(
      "/board?q=bug&projectId=project-1"
    );
    expect(buildIssueViewHref("/issues", params)).toBe(
      "/issues?q=bug&projectId=project-1"
    );
  });

  it("builds issue detail links with the task project as context", () => {
    const href = buildIssueDetailHref(
      "PULSAR-28",
      new URLSearchParams("projectId=all-stale&assignee=me"),
      {
        projectId: "project-1",
        from: "board",
      }
    );

    expect(href).toBe(
      "/tasks/PULSAR-28?projectId=project-1&assignee=me&from=board"
    );
  });

  it("keeps project context when clearing page filters", () => {
    const href = clearIssueFiltersHref(
      "/board",
      new URLSearchParams("projectId=project-1&q=bug&page=2&pageSize=50")
    );

    expect(href).toBe("/board?projectId=project-1&pageSize=50");
  });
});
