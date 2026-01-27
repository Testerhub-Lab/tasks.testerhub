import React from "react";
import Link from "next/link";
import IssueRow from "../../components/issues/IssueRow";
import CreateIssueButton from "../../components/issues/CreateIssueButton";
import IssueFiltersBar from "../../components/filters/IssueFiltersBar";
import { getTasks } from "../../server/queries/tasks";
import { getProjects } from "../../server/queries/projects";
import { normalizePriority } from "../../components/issues/utils";
import {
  hasActiveFilters,
  parseSearchParams,
} from "../../server/validators/issueFilters";

interface BacklogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const BacklogPage = async ({ searchParams }: BacklogPageProps) => {
  const resolvedSearchParams = await searchParams;
  const filters = parseSearchParams(resolvedSearchParams);
  const tasks = await getTasks(filters);
  const projects = await getProjects();
  const isFiltered = hasActiveFilters(filters);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Backlog</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Список входящих задач и багов.
          </p>
        </div>
        <div className="text-sm text-[var(--color-text-secondary)]">
          {tasks.length} issues
        </div>
      </div>
      <IssueFiltersBar
        projects={projects}
        initialFilters={filters}
        basePath="/backlog"
      />
      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] p-8 text-center">
          <p className="text-lg text-white">
            {isFiltered ? "No issues found" : "No tasks yet"}
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {isFiltered
              ? "Попробуйте сбросить фильтры или изменить запрос."
              : "Создайте первый тикет, чтобы начать работу."}
          </p>
          <div className="mt-4 flex justify-center">
            {isFiltered ? (
              <Link
                href="/backlog"
                className="rounded-full border border-[var(--color-card-border)] px-4 py-2 text-sm text-white"
              >
                Clear filters
              </Link>
            ) : (
              <CreateIssueButton />
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <IssueRow
              key={task.id}
              href={`/tasks/${task.key ?? task.id}`}
              issueKey={task.key ?? undefined}
              title={task.title}
              description={task.description}
              priority={normalizePriority(task.priority)}
              status={task.status}
              createdAt={task.createdAt}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BacklogPage;
