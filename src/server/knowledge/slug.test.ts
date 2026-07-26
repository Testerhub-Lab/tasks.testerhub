import { describe, expect, it } from "vitest";
import { createWikiSlug } from "./slug";

describe("createWikiSlug", () => {
  it("normalizes latin titles", () => {
    expect(createWikiSlug("  API Design & Rules  ")).toBe("api-design-rules");
  });

  it("keeps readable cyrillic titles", () => {
    expect(createWikiSlug("Описание проекта Ёж")).toBe("описание-проекта-еж");
  });

  it("uses a fallback for punctuation-only titles", () => {
    expect(createWikiSlug("---")).toBe("page");
  });
});
