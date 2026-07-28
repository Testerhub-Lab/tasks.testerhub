import { describe, expect, it } from "vitest";
import { resourceIDSchema } from "./schemas.js";

describe("resourceIDSchema", () => {
  it("accepts both preserved CUIDs and new UUIDs", () => {
    expect(
      resourceIDSchema.parse("cms24b41p00060ipbc5qiqrtu")
    ).toBe("cms24b41p00060ipbc5qiqrtu");
    expect(
      resourceIDSchema.parse("f8f61815-2a4f-48d7-b21e-530f7dcbe947")
    ).toBe("f8f61815-2a4f-48d7-b21e-530f7dcbe947");
  });

  it("rejects empty and unbounded identifiers", () => {
    expect(resourceIDSchema.safeParse("   ").success).toBe(false);
    expect(resourceIDSchema.safeParse("x".repeat(192)).success).toBe(false);
  });
});
