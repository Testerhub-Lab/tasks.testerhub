import { describe, expect, it } from "vitest";
import { extractWikiHeadings, wikiHeadingSlug } from "./headings";

describe("Wiki headings", () => {
  it("creates stable unicode anchors", () => {
    expect(wikiHeadingSlug("Целевая архитектура: API")).toBe(
      "целевая-архитектура-api"
    );
  });

  it("ignores fenced code and disambiguates duplicate headings", () => {
    expect(
      extractWikiHeadings("# Intro\n## API\n```md\n# Hidden\n```\n## API")
    ).toEqual([
      { level: 1, text: "Intro", id: "intro" },
      { level: 2, text: "API", id: "api" },
      { level: 2, text: "API", id: "api-2" },
    ]);
  });
});
