import Link from "next/link";
import CreateIssueButton from "../../components/issues/CreateIssueButton";
import BoardClient from "../../components/board/BoardClient";
import IssueFiltersBar from "../../components/filters/IssueFiltersBar";
import { getTasks } from "../../server/queries/tasks";
import { getProjects } from "../../server/queries/projects";
import {
  hasActiveFilters,
  parseSearchParams,
} from "../../server/validators/issueFilters";

interface BoardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const BoardPage = async ({ searchParams }: BoardPageProps) => {
  const resolvedSearchParams = await searchParams;
  const filters = parseSearchParams(resolvedSearchParams);

  type Filters = ReturnType<typeof parseSearchParams>;

  const queryFilters: Filters =
    filters.status?.length
      ? filters
      : {
          ...filters,
          status: ["Todo", "In Progress", "Testing", "Done"] as const,
        };

  const tasks = await getTasks(queryFilters);
  const projects = await getProjects();
  const isFiltered = hasActiveFilters(filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Board</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Канбан-представление для ежедневной работы.
          </p>
        </div>
        <div className="text-sm text-[var(--color-text-secondary)]">
          {tasks.length} issues
        </div>
      </div>
      <IssueFiltersBar
        projects={projects}
        initialFilters={filters}
        basePath="/board"
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
                href="/board"
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
        <BoardClient tasks={tasks} />
      )}
    </div>
  );
};

export default BoardPage;
