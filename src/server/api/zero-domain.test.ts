import { describe, expect, it, vi } from "vitest";
import { nextIssueRankForState } from "./zero-domain";
import type { ZeroTransaction } from "../../zero/db";

function serverTransaction(query: ReturnType<typeof vi.fn>) {
  return {
    location: "server",
    dbTransaction: { query },
  } as unknown as ZeroTransaction;
}

describe("Zero API issue rank allocation", () => {
  it("allocates the next rank from the indexed last issue in the state", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "project-1" }] })
      .mockResolvedValueOnce({
        rows: [{ rank: "00000000000000002048" }],
      });

    await expect(
      nextIssueRankForState(serverTransaction(query), {
        projectID: "project-1",
        stateID: "state-1",
      })
    ).resolves.toBe("00000000000000003072");

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("FOR UPDATE");
    expect(query.mock.calls[1][0]).toContain("ORDER BY rank DESC");
    expect(query.mock.calls[1][0]).toContain("LIMIT 1");
    expect(query.mock.calls[1][1]).toEqual(["project-1", "state-1"]);
  });

  it("starts from the first rank when the state has no issues", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "project-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      nextIssueRankForState(serverTransaction(query), {
        projectID: "project-1",
        stateID: "state-1",
      })
    ).resolves.toBe("00000000000000001024");
  });
});
