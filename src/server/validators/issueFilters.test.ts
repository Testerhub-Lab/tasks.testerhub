import { describe, expect, it } from "vitest";
import {
  BOARD_COLUMN_STATUSES,
  BOARD_COLUMN_LIMIT_DEFAULT,
  BOARD_COLUMN_LIMIT_MAX,
  DEFAULT_PAGE_SIZE,
  parseBoardColumnLimitParams,
  parsePaginationParams,
  resolveBoardColumnStatuses,
} from "./issueFilters";

describe("issue pagination search params", () => {
  it("uses defaults when pagination params are absent", () => {
    expect(parsePaginationParams({})).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it.each(["10", "15", "20", "50"] as const)(
    "accepts page size %s",
    (pageSize) => {
      expect(parsePaginationParams({ page: "3", pageSize })).toEqual({
        page: 3,
        pageSize: Number(pageSize),
      });
    }
  );

  it("falls back for invalid page and page size values", () => {
    expect(parsePaginationParams({ page: "0", pageSize: "100" })).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });
});

describe("board column limit search params", () => {
  it("uses the default limit for every board column", () => {
    expect(parseBoardColumnLimitParams({})).toEqual({
      TODO: BOARD_COLUMN_LIMIT_DEFAULT,
      IN_PROGRESS: BOARD_COLUMN_LIMIT_DEFAULT,
      TESTING: BOARD_COLUMN_LIMIT_DEFAULT,
      DONE: BOARD_COLUMN_LIMIT_DEFAULT,
    });
  });

  it("reads independent column limits and clamps them to the supported range", () => {
    expect(
      parseBoardColumnLimitParams({
        todoLimit: "40",
        inProgressLimit: "10",
        testingLimit: "500",
        doneLimit: "abc",
      })
    ).toEqual({
      TODO: 40,
      IN_PROGRESS: BOARD_COLUMN_LIMIT_DEFAULT,
      TESTING: BOARD_COLUMN_LIMIT_MAX,
      DONE: BOARD_COLUMN_LIMIT_DEFAULT,
    });
  });
});

describe("board status filters", () => {
  it("uses every board status when no status filter is selected", () => {
    expect(resolveBoardColumnStatuses({})).toEqual(BOARD_COLUMN_STATUSES);
  });

  it("keeps only selected board statuses in workflow order", () => {
    expect(
      resolveBoardColumnStatuses({ status: ["DONE", "TODO"] })
    ).toEqual(["TODO", "DONE"]);
  });

  it("does not treat backlog-only statuses as board columns", () => {
    expect(resolveBoardColumnStatuses({ status: ["NEW"] })).toEqual([]);
  });
});
