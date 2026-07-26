import { describe, expect, it } from "vitest";
import {
  generateApiToken,
  getApiTokenPrefix,
  verifyApiToken,
} from "./tokens";
import { hasApiScopes, normalizeApiScopes } from "./scopes";

describe("API tokens", () => {
  it("generates a parseable token and verifies only the matching value", () => {
    const generated = generateApiToken();

    expect(generated.plainToken).toMatch(/^pls_pat_[a-f0-9]{16}_/);
    expect(getApiTokenPrefix(generated.plainToken)).toBe(
      generated.tokenPrefix
    );
    expect(verifyApiToken(generated.plainToken, generated.tokenHash)).toBe(true);
    expect(
      verifyApiToken(`${generated.plainToken}x`, generated.tokenHash)
    ).toBe(false);
  });

  it("rejects malformed token prefixes", () => {
    expect(getApiTokenPrefix("not-a-token")).toBeNull();
    expect(getApiTokenPrefix("pls_pat_short_secret")).toBeNull();
  });
});

describe("API scopes", () => {
  it("normalizes supported scopes and removes duplicates", () => {
    expect(
      normalizeApiScopes([
        "projects:read",
        "issues:read",
        "projects:read",
        "unknown",
      ])
    ).toEqual(["projects:read", "issues:read"]);
  });

  it("requires every requested scope", () => {
    expect(
      hasApiScopes(
        ["issues:read", "issues:write"],
        ["issues:read", "issues:write"]
      )
    ).toBe(true);
    expect(
      hasApiScopes(["issues:read"], ["issues:read", "issues:write"])
    ).toBe(false);
  });
});
