import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  parsePaginationParams,
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
