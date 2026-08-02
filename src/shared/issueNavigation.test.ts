import { describe, expect, it } from "vitest";
import {
  DEFAULT_ISSUE_VIEW_PATH,
  buildIssueDetailHref,
  buildProjectIssueViewHref,
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

  it("builds canonical project-key issue view links without projectId", () => {
    const params = new URLSearchParams("projectId=project-1&q=bug&page=3");

    expect(buildProjectIssueViewHref("PULSAR", "/board", params)).toBe(
      "/pulsar/board?q=bug"
    );
    expect(buildProjectIssueViewHref("PULSAR", "/issues", params)).toBe(
      "/pulsar/issues?q=bug"
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

  it("builds canonical project-key issue detail links", () => {
    const href = buildIssueDetailHref(
      "PULSAR-30",
      new URLSearchParams("projectId=project-1&assignee=me"),
      {
        projectId: "project-1",
        projectKey: "PULSAR",
        from: "board",
      }
    );

    expect(href).toBe("/pulsar/issues/PULSAR-30?assignee=me&from=board");
  });

  it("keeps project context when clearing page filters", () => {
    const href = clearIssueFiltersHref(
      "/board",
      new URLSearchParams("projectId=project-1&q=bug&page=2&pageSize=50")
    );

    expect(href).toBe("/board?projectId=project-1&pageSize=50");
  });

  it("keeps canonical project path and clears projectId when clearing filters", () => {
    const href = clearIssueFiltersHref(
      "/pulsar/board",
      new URLSearchParams("projectId=project-1&q=bug&page=2&pageSize=50"),
      { projectKey: "PULSAR" }
    );

    expect(href).toBe("/pulsar/board?pageSize=50");
  });
});
