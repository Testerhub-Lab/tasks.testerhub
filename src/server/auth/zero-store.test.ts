import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeSessionIPAddress,
  usesZeroAuthStore,
} from "./zero-store";

const originalAuthStore = process.env.PULSAR_AUTH_STORE;

afterEach(() => {
  if (originalAuthStore === undefined) {
    delete process.env.PULSAR_AUTH_STORE;
  } else {
    process.env.PULSAR_AUTH_STORE = originalAuthStore;
  }
});

describe("Zero auth store configuration", () => {
  it("is opt-in so production keeps the legacy store before cutover", () => {
    delete process.env.PULSAR_AUTH_STORE;
    expect(usesZeroAuthStore()).toBe(false);

    process.env.PULSAR_AUTH_STORE = "zero";
    expect(usesZeroAuthStore()).toBe(true);
  });

  it("stores only valid request IP addresses", () => {
    expect(normalizeSessionIPAddress("203.0.113.8")).toBe("203.0.113.8");
    expect(normalizeSessionIPAddress("2001:db8::1")).toBe("2001:db8::1");
    expect(normalizeSessionIPAddress("unknown")).toBeNull();
    expect(normalizeSessionIPAddress(null)).toBeNull();
  });
});
