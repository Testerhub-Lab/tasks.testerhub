import Link from "next/link";
import CreateIssueButton from "../../components/issues/CreateIssueButton";
import IssueFiltersBar from "../../components/filters/IssueFiltersBar";
import { getTasks } from "../../server/queries/tasks";
import { getProjects } from "../../server/queries/projects";
import {
  hasActiveFilters,
  parseSearchParams,
} from "../../server/validators/issueFilters";
import BacklogRowClient from "../../components/issues/BacklogRowClient";


interface BacklogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const BacklogPage = async ({ searchParams }: BacklogPageProps) => {
  const resolvedSearchParams = await searchParams;
  const filters = parseSearchParams(resolvedSearchParams);

  type Filters = ReturnType<typeof parseSearchParams>;

  const queryFilters: Filters =
    filters.status?.length
      ? filters
      : {
          ...filters,
          view: "backlog",
          status: ["NEW"] as const,
        };

  const tasks = await getTasks(queryFilters);


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
        mode="compact"
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
          {tasks.map((t) => (
            <BacklogRowClient
              key={t.id}
              id={t.id}
              title={t.title}
              issueKey={t.key}
              priority={t.priority}
              status={t.status}
              createdAt={t.createdAt}
              href={`/tasks/${t.key ?? t.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BacklogPage;
