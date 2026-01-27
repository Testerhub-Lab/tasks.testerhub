"use client";

import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Input from "../ui/Input";
import Select from "../ui/Select";
import Badge from "../ui/Badge";
import FilterChip from "./FilterChip";
import SegmentedChips from "./SegmentedChips";
import {
  parseSearchParams,
  type IssueFilters,
  type IssueFilterPriority,
  type IssueFilterStatus,
} from "../../server/validators/issueFilters";

const statusOptions: IssueFilterStatus[] = ["New", "In Progress", "Testing", "Done"];

const priorityOptions: IssueFilterPriority[] = ["Low", "Medium", "High", "Critical"];

interface IssueFiltersBarProps {
  projects: Array<{ id: string; name: string; key: string }>;
  initialFilters: IssueFilters;
  basePath: string;
}

const IssueFiltersBar: React.FC<IssueFiltersBarProps> = ({
  projects,
  initialFilters,
  basePath,
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tagInput, setTagInput] = useState("");
  const [isOpen, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const currentFilters = useMemo(() => {
    const raw: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      raw[key] = value;
    }
    return parseSearchParams(raw);
  }, [searchParams]);

  const filters = Object.keys(currentFilters).length ? currentFilters : initialFilters;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ Важно: всегда берём актуальную строку query, чтобы фильтры не перетирали q и другие параметры
  const getLatestParams = useCallback(() => {
    if (typeof window !== "undefined") return new URLSearchParams(window.location.search);
    // fallback (на всякий, хотя компонент client-only)
    return new URLSearchParams(searchParams.toString());
  }, [searchParams]);

  const updateParams = useCallback(
    (next: IssueFilters) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        const params = getLatestParams();

        const applyArray = (key: string, values?: string[]) => {
          if (!values || values.length === 0) {
            params.delete(key);
            return;
          }
          params.set(key, values.join(","));
        };

        if (next.q) params.set("q", next.q);
        else params.delete("q");

        applyArray("status", next.status);
        applyArray("priority", next.priority);
        applyArray("tags", next.tags);

        if (next.projectId) params.set("projectId", next.projectId);
        else params.delete("projectId");

        const query = params.toString();

        startTransition(() => {
          router.replace(query ? `${basePath}?${query}` : basePath, {
            scroll: false,
          });
        });
      }, 200);
    },
    [basePath, getLatestParams, router, startTransition]
  );

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const clearFilters = () => {
    startTransition(() => {
      router.replace(basePath, { scroll: false });
    });
  };

  const addTag = () => {
    const nextTag = tagInput.trim();
    if (!nextTag) return;

    const currentTags = filters.tags ?? [];
    if (currentTags.includes(nextTag) || currentTags.length >= 20) {
      setTagInput("");
      return;
    }

    updateParams({ ...filters, tags: [...currentTags, nextTag] });
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    const nextTags = (filters.tags ?? []).filter((item) => item !== tag);
    updateParams({ ...filters, tags: nextTags.length ? nextTags : undefined });
  };

  const showProjectSelect = projects.length > 1;

  const statusValue = filters.status?.[0] ?? "__all__";
  const priorityValue = filters.priority?.[0] ?? "__all__";

  return (
    <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <FilterChip selected={isOpen} onClick={() => setOpen((prev) => !prev)}>
            Filters
          </FilterChip>

          <div className="flex flex-wrap gap-2 overflow-hidden text-xs text-[var(--color-text-secondary)]">
            {(filters.status ?? []).map((status) => (
              <Badge key={status}>{status}</Badge>
            ))}
            {(filters.priority ?? []).map((priority) => (
              <Badge key={priority}>{priority}</Badge>
            ))}
            {(filters.tags ?? []).map((tag) => (
              <Badge key={tag} className="text-cyan-100">
                #{tag}
              </Badge>
            ))}
            {filters.projectId && projects.length > 0 ? (
              <Badge>
                {projects.find((p) => p.id === filters.projectId)?.key ?? "Project"}
              </Badge>
            ) : null}
          </div>
        </div>

        {(filters.status?.length ||
          filters.priority?.length ||
          filters.tags?.length ||
          filters.projectId) && <FilterChip onClick={clearFilters}>Clear</FilterChip>}
      </div>

      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen
            ? "mt-3 max-h-[240px] opacity-100 pointer-events-auto"
            : "max-h-0 opacity-0 pointer-events-none"
        }`}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)]">Status</span>

              <div className="segmented-pill">
                <SegmentedChips
                  groupId="status"
                  value={statusValue}
                  onChange={(next) => {
                    const value = next ?? "__all__";
                    requestAnimationFrame(() => {
                      updateParams({
                        ...filters,
                        status:
                          value === "__all__" ? undefined : [value as IssueFilterStatus],
                      });
                    });
                  }}
                  options={[
                    { label: "All", value: "__all__" },
                    ...statusOptions.map((status) => ({ label: status, value: status })),
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)]">Priority</span>

              <div className="segmented-pill">
                <SegmentedChips
                  groupId="priority"
                  value={priorityValue}
                  onChange={(next) => {
                    const value = next ?? "__all__";
                    requestAnimationFrame(() => {
                      updateParams({
                        ...filters,
                        priority:
                          value === "__all__" ? undefined : [value as IssueFilterPriority],
                      });
                    });
                  }}
                  options={[
                    { label: "All", value: "__all__" },
                    ...priorityOptions.map((priority) => ({
                      label: priority,
                      value: priority,
                    })),
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)]">Tags</span>

              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={tagInput}
                  placeholder="Add tag"
                  onChange={(event) => setTagInput(event.target.value)}
                  className="h-9 w-36 rounded-xl text-sm"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                />
                <FilterChip onClick={addTag}>Add</FilterChip>
              </div>

              <div className="flex flex-wrap gap-2">
                {(filters.tags ?? []).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-xs font-medium text-cyan-100"
                    onClick={() => removeTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)]">Project</span>

              {showProjectSelect ? (
                <Select
                  name="projectId"
                  value={filters.projectId ?? ""}
                  onChange={(event) =>
                    updateParams({
                      ...filters,
                      projectId: event.target.value || undefined,
                    })
                  }
                  className="h-9 max-w-[220px] rounded-xl text-sm"
                  options={[
                    { value: "", label: "All projects" },
                    ...projects.map((project) => ({
                      value: project.id,
                      label: `${project.key} — ${project.name}`,
                    })),
                  ]}
                />
              ) : (
                <span className="text-sm text-white">
                  {projects[0] ? `${projects[0].key} — ${projects[0].name}` : "—"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IssueFiltersBar;
