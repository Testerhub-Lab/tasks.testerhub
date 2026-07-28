"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Select from "../ui/Select";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type IssuePageSize,
} from "../../server/validators/issueFilters";

type IssuePaginationProps = {
  basePath: string;
  page: number;
  pageSize: IssuePageSize;
  totalCount: number;
  totalPages: number;
  itemCount: number;
};

function pageHref(
  basePath: string,
  searchParams: URLSearchParams,
  page: number
) {
  const params = new URLSearchParams(searchParams.toString());
  if (page <= 1) params.delete("page");
  else params.set("page", String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export default function IssuePagination({
  basePath,
  page,
  pageSize,
  totalCount,
  totalPages,
  itemCount,
}: IssuePaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = totalCount === 0 ? 0 : from + itemCount - 1;

  const updatePageSize = (nextPageSize: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const parsed = Number(nextPageSize) as IssuePageSize;
    params.delete("page");
    if (parsed === DEFAULT_PAGE_SIZE) {
      params.delete("pageSize");
    } else {
      params.set("pageSize", nextPageSize);
    }
    const query = params.toString();
    router.replace(query ? `${basePath}?${query}` : basePath, {
      scroll: false,
    });
  };

  const previousHref = pageHref(basePath, searchParams, page - 1);
  const nextHref = pageHref(basePath, searchParams, page + 1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/5 bg-[rgba(255,255,255,0.015)] px-3 py-2 text-xs text-white/60">
      <span>
        {from}-{to} of {totalCount}
      </span>

      <div className="flex items-center gap-2">
        <span>Rows</span>
        <Select
          aria-label="Rows per page"
          value={String(pageSize)}
          onChange={(event) => updatePageSize(event.target.value)}
          className="h-8 w-20 rounded-sm text-xs"
          options={PAGE_SIZE_OPTIONS.map((value) => ({
            value: String(value),
            label: String(value),
          }))}
        />

        <div className="flex items-center gap-1">
          {page <= 1 ? (
            <span className="rounded-md border border-white/5 px-3 py-1.5 text-white/30">
              Previous
            </span>
          ) : (
            <Link
              href={previousHref}
              scroll={false}
              className="rounded-md border border-white/10 px-3 py-1.5 text-white/75 transition-colors hover:bg-white/5"
            >
              Previous
            </Link>
          )}
          <span className="px-2 text-white/45">
            {page}/{totalPages}
          </span>
          {page >= totalPages ? (
            <span className="rounded-md border border-white/5 px-3 py-1.5 text-white/30">
              Next
            </span>
          ) : (
            <Link
              href={nextHref}
              scroll={false}
              className="rounded-md border border-white/10 px-3 py-1.5 text-white/75 transition-colors hover:bg-white/5"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
