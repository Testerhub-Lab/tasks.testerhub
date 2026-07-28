import { describe, expect, it } from "vitest";
import {
  orderWikiPages,
  parseWikiCutoverSnapshot,
  requireIssueLinkDropApproval,
  serializeWikiCutoverSnapshot,
  wikiCutoverChecksum,
  type WikiCutoverSnapshot,
} from "./wiki-snapshot";

function snapshot(): WikiCutoverSnapshot {
  return {
    format: "pulsar-native-wiki-cutover",
    version: 1,
    exportedAt: "2026-07-28T00:00:00.000Z",
    projects: [
      {
        sourceID: "legacy-project",
        key: "PULSAR",
        name: "Pulsar",
        createdAt: "2026-07-26T00:00:00.000Z",
        archivedAt: null,
        pages: [
          {
            sourceID: "child",
            sourceParentID: "root",
            title: "Child",
            slug: "child",
            contentMarkdown: "child",
            sortOrder: 1,
            version: 1,
            createdAt: "2026-07-26T00:00:00.000Z",
            updatedAt: "2026-07-26T00:00:00.000Z",
            archivedAt: null,
            revisions: [
              {
                sourceID: "child-r1",
                version: 1,
                title: "Child",
                contentMarkdown: "child",
                createdAt: "2026-07-26T00:00:00.000Z",
              },
            ],
          },
          {
            sourceID: "root",
            sourceParentID: null,
            title: "Root",
            slug: "root",
            contentMarkdown: "root v2",
            sortOrder: 0,
            version: 2,
            createdAt: "2026-07-26T00:00:00.000Z",
            updatedAt: "2026-07-27T00:00:00.000Z",
            archivedAt: null,
            revisions: [
              {
                sourceID: "root-r1",
                version: 1,
                title: "Root",
                contentMarkdown: "root v1",
                createdAt: "2026-07-26T00:00:00.000Z",
              },
              {
                sourceID: "root-r2",
                version: 2,
                title: "Root",
                contentMarkdown: "root v2",
                createdAt: "2026-07-27T00:00:00.000Z",
              },
            ],
          },
        ],
        issueLinks: [
          {
            sourceID: "link-1",
            issueKey: "PULSAR-1",
            documentKey: "root",
            title: "Root",
            createdAt: "2026-07-27T00:00:00.000Z",
          },
        ],
      },
    ],
  };
}

describe("Wiki cutover snapshot", () => {
  it("orders parents before children and produces a stable checksum", () => {
    const parsed = parseWikiCutoverSnapshot(snapshot());
    expect(orderWikiPages(parsed.projects[0].pages).map((page) => page.sourceID))
      .toEqual(["root", "child"]);

    const serialized = serializeWikiCutoverSnapshot(parsed);
    expect(wikiCutoverChecksum(serialized)).toMatch(/^[a-f0-9]{64}$/);
    expect(wikiCutoverChecksum(serialized)).toBe(
      wikiCutoverChecksum(serializeWikiCutoverSnapshot(parsed))
    );
  });

  it("requires explicit approval before dropping issue links", () => {
    const parsed = parseWikiCutoverSnapshot(snapshot());
    expect(() => requireIssueLinkDropApproval(parsed, false)).toThrow(
      "1 issue-to-Wiki links"
    );
    expect(requireIssueLinkDropApproval(parsed, true)).toBe(1);
  });

  it("rejects broken trees and incomplete revision history", () => {
    const brokenParent = snapshot();
    brokenParent.projects[0].pages[0].sourceParentID = "missing";
    expect(() => parseWikiCutoverSnapshot(brokenParent)).toThrow(
      "Wiki parent missing"
    );

    const brokenRevisions = snapshot();
    brokenRevisions.projects[0].pages[1].revisions.pop();
    expect(() => parseWikiCutoverSnapshot(brokenRevisions)).toThrow(
      "revision sequence mismatch"
    );
  });
});
