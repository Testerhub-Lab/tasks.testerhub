import { describe, expect, it } from "vitest";
import { Status } from "@prisma/client";
import { zeroStateToLegacyStatus } from "./zero-legacy";

describe("Zero legacy UI status mapping", () => {
  it.each([
    ["Backlog", "BACKLOG", Status.NEW],
    ["Todo", "UNSTARTED", Status.TODO],
    ["Hold", "STARTED", Status.HOLD],
    ["In progress", "STARTED", Status.IN_PROGRESS],
    ["Testing", "STARTED", Status.TESTING],
    ["Done", "COMPLETED", Status.DONE],
    ["Rejected", "CANCELED", Status.REJECT],
  ] as const)("maps %s to %s", (name, category, expected) => {
    expect(zeroStateToLegacyStatus({ name, category })).toBe(expected);
  });

  it("falls back to the workflow category for custom state names", () => {
    expect(
      zeroStateToLegacyStatus({
        name: "Ready for QA",
        category: "STARTED",
      })
    ).toBe(Status.IN_PROGRESS);
  });
});
