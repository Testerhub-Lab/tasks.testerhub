import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKFLOW_STATES,
  issueKey,
  rankAfter,
  workspaceSlug,
} from "./stage3";

describe("Zero Stage 3 helpers", () => {
  it("defines a stable default workflow order", () => {
    expect(DEFAULT_WORKFLOW_STATES.map((state) => state.category)).toEqual([
      "BACKLOG",
      "UNSTARTED",
      "STARTED",
      "COMPLETED",
    ]);
    expect(
      DEFAULT_WORKFLOW_STATES.map((state) => state.rank).toSorted()
    ).toEqual(DEFAULT_WORKFLOW_STATES.map((state) => state.rank));
  });

  it("appends a lexically sortable fractional rank", () => {
    const ranks = [
      "00000000000000001024",
      "00000000000000003072",
      "not-a-numeric-rank",
    ];
    const next = rankAfter(ranks);

    expect(next).toBe("00000000000000004096");
    expect([...ranks.slice(0, 2), next].toSorted().at(-1)).toBe(next);
  });

  it("formats the visible issue key", () => {
    expect(issueKey("PULSAR", 9)).toBe("PULSAR-9");
  });

  it("creates a safe workspace slug for any display name", () => {
    const userID = "019b0000-0000-7000-8000-000000000001";

    expect(workspaceSlug("Product Team", userID)).toBe(
      "product-team-019b0000"
    );
    expect(workspaceSlug("Команда", userID)).toBe("workspace-019b0000");
  });
});
