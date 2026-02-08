"use client";

import React, { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Priority, Status } from "@prisma/client";

import Input from "../ui/Input";
import Select from "../ui/Select";
import FilterChip from "./FilterChip";
import SegmentedChips from "./SegmentedChips";
import { parseSearchParams, type IssueFilters } from "../../server/validators/issueFilters";

const STATUS_OPTIONS: Status[] = [
  Status.NEW,
  Status.TODO,
  Status.IN_PROGRESS,
  Status.TESTING,
  Status.DONE,
];

const PRIORITY_OPTIONS: Priority[] = [
  Priority.LOW,
  Priority.MEDIUM,
  Priority.HIGH,
  Priority.CRITICAL,
];

const STATUS_LABEL: Record<Status, string> = {
  [Status.NEW]: "New",
  [Status.TODO]: "To Do",
  [Status.HOLD]: "Hold",
  [Status.IN_PROGRESS]: "In Progress",
  [Status.TESTING]: "Testing",
  [Status.DONE]: "Done",
  [Status.REJECT]: "Reject",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  [Priority.LOW]: "Low",
  [Priority.MEDIUM]: "Medium",
  [Priority.HIGH]: "High",
  [Priority.CRITICAL]: "Critical",
};

interface IssueFiltersBarProps {
  projects: Array<{ id: string; name: string; key: string }>;
  initialFilters: IssueFilters;
  basePath: string;
  hideFiltersButton?: boolean;
  mode?: "default" | "compact";
  density?: "default" | "compact";
  showProjectFilter?: "always" | "mobile" | "never";
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
      ? "border-cyan-400/25 bg-cyan-400/8 text-cyan-100 hover:border-cyan-400/35 hover:bg-cyan-400/12"
      : "border-white/8 bg-white/4 text-white/70 hover:border-white/15 hover:bg-white/8";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove();
      }}
      className={[
        "group inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]",
        "max-w-[220px]",
        "transition-colors",
        base,
      ].join(" ")}
      title={title ?? "Remove"}
    >
      <span className="truncate">{children}</span>
      <span className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-sm text-white/40 group-hover:text-white/75">
        ×
      </span>
    </button>
  );
};

const IssueFiltersBar: React.FC<IssueFiltersBarProps> = ({
  projects,
  initialFilters,
  basePath,
  hideFiltersButton,
  mode = "default",
  density = "default",
  showProjectFilter = "always",
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tagInput, setTagInput] = useState("");
  const [isOpen, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentFilters = useMemo(() => {
    const raw: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) raw[key] = value;
    return parseSearchParams(raw);
  }, [searchParams]);

  const filters = Object.keys(currentFilters).length ? currentFilters : initialFilters;

  const getLatestParams = useCallback(() => {
    if (typeof window !== "undefined") return new URLSearchParams(window.location.search);
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

        // В URL пишем enum-строки (TODO, IN_PROGRESS, LOW...)
        applyArray("status", next.status as unknown as string[] | undefined);
        applyArray("priority", next.priority as unknown as string[] | undefined);
        applyArray("tags", next.tags);

        if (next.projectId) params.set("projectId", next.projectId);
        else params.delete("projectId");

        if (next.assignee) params.set("assignee", next.assignee);
        else params.delete("assignee");

        const query = params.toString();

        startTransition(() => {
          router.replace(query ? `${basePath}?${query}` : basePath, { scroll: false });
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

  const isProjectFilterVisible = showProjectFilter !== "never";
  const showProjectSelect = projects.length > 1 && isProjectFilterVisible;
  const projectFilterClass =
    showProjectFilter === "mobile" ? "lg:hidden" : "";
  const isCompact = mode === "compact";
  const isDense = density === "compact";
  const controlHeight = isDense ? "h-8" : "h-9";
  const controlRadius = isDense ? "rounded-sm" : "rounded-md";
  const controlText = isDense ? "text-xs" : "text-sm";
  const chipSize = isDense ? "h-7 px-2 text-[11px]" : "";
  const wrapperPad = isDense ? "px-3 py-2" : "px-4 py-3";
  const wrapperRadius = isDense ? "rounded-md" : "rounded-lg";
  const rowGap = isDense ? "gap-2" : "gap-3";

  const hasActive =
    (filters.status?.length ?? 0) > 0 ||
    (filters.priority?.length ?? 0) > 0 ||
    (filters.tags?.length ?? 0) > 0 ||
    !!filters.projectId ||
    !!filters.assignee;

  const activeCount =
    (filters.status?.length ?? 0) +
    (filters.priority?.length ?? 0) +
    (filters.tags?.length ?? 0) +
    (filters.projectId ? 1 : 0) +
    (filters.assignee ? 1 : 0);

  // --- removable handlers (тут типы уже enum)
  const removeStatus = (status: Status) => {
    const next = (filters.status ?? []).filter((s) => s !== status);
    updateParams({ ...filters, status: next.length ? next : undefined });
  };

  const removePriority = (priority: Priority) => {
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

  const clearAssignee = () => {
    updateParams({ ...filters, assignee: undefined });
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

  // =========================
  // Compact: только Project + Clear
  // =========================
  if (isCompact) {
    if (!showProjectSelect && !(filters.q || filters.projectId || filters.assignee)) {
      return null;
    }
    return (
      <div
        className={[
          wrapperRadius,
          wrapperPad,
          "border border-white/5",
          "bg-[rgba(255,255,255,0.015)]",
        ].join(" ")}
      >
        <div className={`flex flex-wrap items-center justify-between ${rowGap}`}>
          <div className={`flex min-w-0 flex-1 items-center ${rowGap}`}>
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
                className={`${controlHeight} ${controlRadius} ${controlText} max-w-[320px] ${projectFilterClass}`}
                options={[
                  { value: "", label: "All projects" },
                  ...projects.map((project) => ({
                    value: project.id,
                    label: `${project.key} — ${project.name}`,
                  })),
                ]}
              />
            ) : isProjectFilterVisible ? (
              <span className="text-sm text-white/80">
                {projects[0] ? `${projects[0].key} — ${projects[0].name}` : "—"}
              </span>
            ) : null}
          </div>

          {(filters.q || filters.projectId) ? (
            <FilterChip onClick={clearFilters} className={chipSize}>
              Clear
            </FilterChip>
          ) : null}
        </div>
      </div>
    );
  }

  const statusValues = (filters.status ?? []) as unknown as string[];
  const priorityValues = (filters.priority ?? []) as unknown as string[];

  return (
    <div
      className={[
        wrapperRadius,
        wrapperPad,
        "border border-white/5",
        "bg-[rgba(255,255,255,0.015)]",
      ].join(" ")}
    >
      <div
        className={`flex flex-wrap items-center justify-between ${rowGap} cursor-pointer`}
        onClick={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest("button,a,input,select,textarea")) return;
          setOpen((prev) => !prev);
        }}
      >
        <div className={`flex min-w-0 flex-1 items-center ${rowGap}`}>
          {!hideFiltersButton ? (
            <FilterChip
              selected={isOpen}
              onClick={() => setOpen((prev) => !prev)}
              className={chipSize}
            >
              <span className="inline-flex items-center gap-1.5" title="Filters">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5 text-white/70"
                >
                  <path
                    d="M2.5 3.5h11M4.5 8h7M6.5 12.5h3"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
                {hasActive ? (
                  <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
                    {activeCount}
                  </span>
                ) : null}
              </span>
              <span className="ml-2 text-white/45">{isOpen ? "▴" : "▾"}</span>
            </FilterChip>
          ) : null}

          <div className="flex flex-wrap gap-2 overflow-hidden">
            {(filters.status ?? []).map((s) => (
              <RemovableChip
                key={s}
                onRemove={() => removeStatus(s as Status)}
                title="Remove status"
              >
                {STATUS_LABEL[s as Status] ?? String(s)}
              </RemovableChip>
            ))}

            {(filters.priority ?? []).map((p) => (
              <RemovableChip
                key={p}
                onRemove={() => removePriority(p as Priority)}
                title="Remove priority"
              >
                {PRIORITY_LABEL[p as Priority] ?? String(p)}
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

            {filters.assignee ? (
              <RemovableChip onRemove={clearAssignee} title="Remove assignee">
                Assignee: {filters.assignee === "me" ? "Me" : filters.assignee}
              </RemovableChip>
            ) : null}

            {filters.projectId && projects.length > 0 && isProjectFilterVisible ? (
              <div className={projectFilterClass}>
                <RemovableChip onRemove={clearProject} title="Remove project">
                  {projects.find((p) => p.id === filters.projectId)?.key ?? "Project"}
                </RemovableChip>
              </div>
            ) : null}
          </div>
        </div>

        {hasActive ? (
          <FilterChip onClick={clearFilters} className={chipSize}>
            Clear
          </FilterChip>
        ) : null}
      </div>

      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? "mt-3 max-h-[420px] opacity-100 pointer-events-auto" : "max-h-0 opacity-0 pointer-events-none"
        }`}
      >
        <div className="grid grid-cols-12 gap-4">
          {/* STATUS */}
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
                      STATUS_OPTIONS.includes(v as Status)
                    ) as Status[];

                    requestAnimationFrame(() => {
                      updateParams({
                        ...filters,
                        status: normalized.length ? normalized : undefined,
                      });
                    });
                  }}
                  options={[
                    { label: "All", value: "__all__" },
                    ...STATUS_OPTIONS.map((s) => ({ label: STATUS_LABEL[s], value: s })),
                  ]}
                />
              </div>
            </div>
          </div>

          {/* PRIORITY */}
          <div className="col-span-12 lg:col-span-4 lg:hidden">
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
                      PRIORITY_OPTIONS.includes(v as Priority)
                    ) as Priority[];

                    requestAnimationFrame(() => {
                      updateParams({
                        ...filters,
                        priority: normalized.length ? normalized : undefined,
                      });
                    });
                  }}
                  options={[
                    { label: "All", value: "__all__" },
                    ...PRIORITY_OPTIONS.map((p) => ({ label: PRIORITY_LABEL[p], value: p })),
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
                  className={`${controlHeight} ${controlRadius} ${controlText} w-36`}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                />
                <FilterChip onClick={addTag} className={chipSize}>
                  Add
                </FilterChip>
              </div>

              <div className="flex flex-wrap gap-2">
                {(filters.tags ?? []).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="rounded-md border border-cyan-400/25 bg-cyan-400/8 px-2 py-1 text-xs font-medium text-cyan-100"
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
          <div className={`col-span-12 lg:col-span-4 ${projectFilterClass}`}>
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
                  className={`${controlHeight} ${controlRadius} ${controlText} max-w-[220px]`}
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
