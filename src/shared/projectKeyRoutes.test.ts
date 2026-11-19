import { describe, expect, it } from "vitest";
import {
  buildProjectIssueDetailPath,
  buildProjectIssueViewPath,
  buildWikiHref,
  findProjectByRouteContext,
  getProjectKeyFromPathname,
  projectKeyPathSegment,
  removeProjectIdParam,
} from "./projectKeyRoutes";

describe("project key routes", () => {
  it("normalizes project keys for path segments", () => {
    expect(projectKeyPathSegment("PULSAR")).toBe("pulsar");
    expect(buildProjectIssueViewPath("PULSAR", "/board")).toBe("/pulsar/board");
    expect(buildProjectIssueDetailPath("PULSAR", "PULSAR-30")).toBe(
      "/pulsar/issues/PULSAR-30"
    );
  });

  it("extracts project keys from issue and wiki paths", () => {
    expect(getProjectKeyFromPathname("/pulsar/board")).toBe("pulsar");
    expect(getProjectKeyFromPathname("/pulsar/issues/PULSAR-30")).toBe(
      "pulsar"
    );
    expect(getProjectKeyFromPathname("/wiki/finpeace/page-1")).toBe(
      "finpeace"
    );
    expect(getProjectKeyFromPathname("/wiki")).toBeNull();
    expect(getProjectKeyFromPathname("/wiki/-/new")).toBeNull();
    expect(getProjectKeyFromPathname("/settings/workspace")).toBeNull();
  });

  it("opens the selected product Wiki or the workspace Wiki for All products", () => {
    expect(buildWikiHref("EP")).toBe("/wiki/EP");
    expect(buildWikiHref(null)).toBe("/wiki");
  });

  it("resolves project context by id or path key", () => {
    const projects = [
      { id: "1", key: "PULSAR" },
      { id: "2", key: "LOAD10K" },
    ];

    expect(
      findProjectByRouteContext(projects, {
        pathname: "/load10k/board",
      })
    ).toEqual(projects[1]);
    expect(
      findProjectByRouteContext(projects, {
        pathname: "/wiki/load10k/overview",
      })
    ).toEqual(projects[1]);
    expect(
      findProjectByRouteContext(projects, {
        pathname: "/load10k/board",
        projectId: "1",
      })
    ).toEqual(projects[0]);
  });

  it("removes legacy projectId from canonical query params", () => {
    const params = removeProjectIdParam(
      new URLSearchParams("projectId=1&q=bug&pageSize=20")
    );
    expect(params.toString()).toBe("q=bug&pageSize=20");
  });
});
