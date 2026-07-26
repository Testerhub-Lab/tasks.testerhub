import { describe, expect, it } from "vitest";
import { KnowledgeProvider } from "@prisma/client";
import {
  getKnowledgeHomeHref,
  isNativeKnowledgeEnabled,
} from "./providerPolicy";

describe("knowledge provider policy", () => {
  it("keeps a disabled module unreachable", () => {
    expect(
      getKnowledgeHomeHref("LMS", {
        provider: KnowledgeProvider.DISABLED,
        externalUrl: null,
      })
    ).toBeNull();
  });

  it("routes native knowledge through Pulsar", () => {
    expect(
      getKnowledgeHomeHref("LMS", {
        provider: KnowledgeProvider.NATIVE,
        externalUrl: null,
      })
    ).toBe("/wiki/LMS");
  });

  it("uses the configured external provider URL", () => {
    expect(
      getKnowledgeHomeHref("LMS", {
        provider: KnowledgeProvider.EXTERNAL,
        externalUrl: "https://example.com/team/lms",
      })
    ).toBe("https://example.com/team/lms");
  });

  it("reports native capability independently of stored pages", () => {
    expect(
      isNativeKnowledgeEnabled({
        provider: KnowledgeProvider.NATIVE,
        externalUrl: null,
      })
    ).toBe(true);
    expect(isNativeKnowledgeEnabled(null)).toBe(false);
  });
});
