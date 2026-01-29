"use client";

import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
  useEffect,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Input from "../ui/Input";
import Select from "../ui/Select";
import FilterChip from "./FilterChip";
import SegmentedChips from "./SegmentedChips";
import {
  parseSearchParams,
  type IssueFilters,
  type IssueFilterPriority,
  type IssueFilterStatus,
} from "../../server/validators/issueFilters";

const statusOptions: IssueFilterStatus[] = ["New", "Todo", "In Progress", "Testing", "Done"];
const priorityOptions: IssueFilterPriority[] = ["Low", "Medium", "High", "Critical"];

interface IssueFiltersBarProps {
  projects: Array<{ id: string; name: string; key: string }>;
  initialFilters: IssueFilters;
  basePath: string;
  hideFiltersButton?: boolean;
  mode?: "default" | "compact";
}

const RemovableChip = ({
  children,
  onRemove,
  title,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onRemove: () => void;
  title?: string;
  tone?: "neutral" | "cyan";
}) => {
  const base =
    tone === "cyan"
      ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100 hover:border-cyan-400/45 hover:bg-cyan-400/15"
      : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove();
      }}
      className={[
        "group inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px]",
        "max-w-[220px]",
        "transition-colors",
        base,
      ].join(" ")}
      title={title ?? "Remove"}
    >
      <span className="truncate">{children}</span>
      <span className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full text-white/40 group-hover:text-white/75">
        ×
      </span>
    </button>
  );
};

const IssuesFiltersBar: React.FC<IssueFiltersBarProps> = ({
  projects,
  initialFilters,
  basePath,
  hideFiltersButton,
  mode = "default",
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tagInput, setTagInput] = useState("");
  const [isOpen, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const currentFilters = useMemo(() => {
    const raw: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) raw[key] = value;
    return parseSearchParams(raw);
  }, [searchParams]);

  const filters = Object.keys(currentFilters).length ? currentFilters : initialFilters;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const getLatestParams = useCallback(() => {
    if (typeof window !== "undefined")
      return new URLSearchParams(window.location.search);
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

  const hasActive =
    (filters.status?.length ?? 0) > 0 ||
    (filters.priority?.length ?? 0) > 0 ||
    (filters.tags?.length ?? 0) > 0 ||
    !!filters.projectId;

  const activeCount =
    (filters.status?.length ?? 0) +
    (filters.priority?.length ?? 0) +
    (filters.tags?.length ?? 0) +
    (filters.projectId ? 1 : 0);

  // --- removable handlers
  const removeStatus = (status: IssueFilterStatus) => {
    const next = (filters.status ?? []).filter((s) => s !== status);
    updateParams({ ...filters, status: next.length ? next : undefined });
  };

  const removePriority = (priority: IssueFilterPriority) => {
    const next = (filters.priority ?? []).filter((p) => p !== priority);
    updateParams({ ...filters, priority: next.length ? next : undefined });
  };

  const removeTag = (tag: string) => {
    const next = (filters.tags ?? []).filter((t) => t !== tag);
    updateParams({ ...filters, tags: next.length ? next : undefined });
  };

  const clearProject = () => {
    updateParams({ ...filters, projectId: undefined });
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

  const showProjectSelect = projects.length > 1;
  const isCompact = mode === "compact";

  if (isCompact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
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
              className="h-9 max-w-[320px] rounded-xl text-sm"
              options={[
                { value: "", label: "All projects" },
                ...projects.map((project) => ({
                  value: project.id,
                  label: `${project.key} — ${project.name}`,
                })),
              ]}
            />
          ) : (
            <span className="text-sm text-white/80">
              {projects[0] ? `${projects[0].key} — ${projects[0].name}` : "—"}
            </span>
          )}
        </div>
  
        {(filters.q || filters.projectId) ? (
          <FilterChip onClick={clearFilters}>Clear</FilterChip>
        ) : null}
      </div>
    );
  }  

  const statusValues: string[] = filters.status ?? [];
  const priorityValues: string[] = filters.priority ?? [];

  return (
    <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] px-4 py-3">
      
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">

          <FilterChip selected={isOpen} onClick={() => setOpen((prev) => !prev)}>
            <span className="mr-2">Filters</span>
            {hasActive ? (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[12px] text-white/70">
                {activeCount}
              </span>
            ) : null}
            <span className="ml-2 text-white/45">{isOpen ? "▴" : "▾"}</span>
          </FilterChip>

          <div className="flex flex-wrap gap-2 overflow-hidden">
            {(filters.status ?? []).map((status) => (
              <RemovableChip key={status} onRemove={() => removeStatus(status)} title="Remove status">
                {status}
              </RemovableChip>
            ))}

            {(filters.priority ?? []).map((priority) => (
              <RemovableChip
                key={priority}
                onRemove={() => removePriority(priority)}
                title="Remove priority"
              >
                {priority}
              </RemovableChip>
            ))}

            {(filters.tags ?? []).map((tag) => (
              <RemovableChip
                key={tag}
                onRemove={() => removeTag(tag)}
                title="Remove tag"
                tone="cyan"
              >
                #{tag}
              </RemovableChip>
            ))}

            {filters.projectId && projects.length > 0 ? (
              <RemovableChip onRemove={clearProject} title="Remove project">
                {projects.find((p) => p.id === filters.projectId)?.key ?? "Project"}
              </RemovableChip>
            ) : null}
          </div>
        </div>

        {hasActive ? <FilterChip onClick={clearFilters}>Clear</FilterChip> : null}
      </div>
      
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen
            ? "mt-3 max-h-[420px] opacity-100 pointer-events-auto"
            : "max-h-0 opacity-0 pointer-events-none"
        }`}
      >
        <div className="grid grid-cols-12 gap-4">
          {/* STATUS (multi) */}
          <div className="col-span-12 lg:col-span-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)]">Status</span>

              <div className="segmented-pill">
                <SegmentedChips
                  groupId="status"
                  multiple
                  value={statusValues}
                  onChange={(next) => {
                    const arr = Array.isArray(next) ? next : [];
                    const normalized = arr.filter((v) =>
                      statusOptions.includes(v as IssueFilterStatus)
                    ) as IssueFilterStatus[];

                    requestAnimationFrame(() => {
                      updateParams({
                        ...filters,
                        status: normalized.length ? normalized : undefined,
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

          {/* PRIORITY (multi) */}
          <div className="col-span-12 lg:col-span-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)]">Priority</span>

              <div className="segmented-pill">
                <SegmentedChips
                  groupId="priority"
                  multiple
                  value={priorityValues}
                  onChange={(next) => {
                    const arr = Array.isArray(next) ? next : [];
                    const normalized = arr.filter((v) =>
                      priorityOptions.includes(v as IssueFilterPriority)
                    ) as IssueFilterPriority[];

                    requestAnimationFrame(() => {
                      updateParams({
                        ...filters,
                        priority: normalized.length ? normalized : undefined,
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

          {/* TAGS */}
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
                    title="Remove tag"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* PROJECT */}
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


export default IssuesFiltersBar;
