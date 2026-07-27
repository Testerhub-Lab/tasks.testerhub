import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { findIssueCandidateIDs, issueSearchSQL } from "./issue-search";

describe("PostgreSQL issue search", () => {
  it("scopes candidates by membership before ranking them", () => {
    expect(issueSearchSQL).toContain("JOIN workspace_members AS member");
    expect(issueSearchSQL).toContain("member.user_id = $1");
    expect(issueSearchSQL).toContain("websearch_to_tsquery('simple', $2)");
    expect(issueSearchSQL).toContain("similarity(scoped.title, $2)");
    expect(issueSearchSQL).toContain("scoped.api_status = ANY($5::text[])");
  });

  it("passes normalized filters and treats LIKE metacharacters literally", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "00000000-0000-7000-8000-000000000040" }],
    });
    const pool = { query } as unknown as Pick<Pool, "query">;

    await expect(
      findIssueCandidateIDs(pool, {
        userID: "00000000-0000-7000-8000-000000000001",
        query: "  100%_done  ",
        projectKey: "pulsar",
        statuses: ["IN_PROGRESS"],
        limit: 25,
      })
    ).resolves.toEqual(["00000000-0000-7000-8000-000000000040"]);

    expect(query).toHaveBeenCalledWith(issueSearchSQL, [
      "00000000-0000-7000-8000-000000000001",
      "100%_done",
      "100\\%\\_done",
      "PULSAR",
      ["IN_PROGRESS"],
      25,
    ]);
  });
});
