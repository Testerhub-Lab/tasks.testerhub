import Link from "next/link";
import CreateIssueButton from "../../components/issues/CreateIssueButton";
import IssueFiltersBar from "../../components/filters/IssueFiltersBar";
import IssuePagination from "../../components/issues/IssuePagination";
import BacklogSeen from "../../components/backlog/BacklogSeen";
import { getPaginatedTasks } from "../../server/queries/tasks";
import { getProjects } from "../../server/queries/projects";
import { getCurrentUser } from "../../server/auth/session";
import { getCurrentWorkspaceId } from "../../server/auth/workspace";
import { getAccessibleProjectIds } from "../../server/auth/access";
import { redirect } from "next/navigation";
import {
  hasActiveFilters,
  parsePaginationParams,
  parseSearchParams,
} from "../../server/validators/issueFilters";
import BacklogListClient from "../../components/backlog/BacklogListClient";


interface BacklogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const BacklogPage = async ({ searchParams }: BacklogPageProps) => {
  const resolvedSearchParams = await searchParams;
  const filters = parseSearchParams(resolvedSearchParams);
  const paginationInput = parsePaginationParams(resolvedSearchParams);

  type Filters = ReturnType<typeof parseSearchParams>;

  const queryFilters: Filters = {
    ...filters,
    view: "backlog",
    status: ["NEW"] as const,
  };

  const user = await getCurrentUser();
  if (!user) redirect("/signin?redirect=/backlog");
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/signin?redirect=/backlog");
  const accessibleProjectIds = await getAccessibleProjectIds(user, workspaceId);
  const paginated = await getPaginatedTasks(
    queryFilters,
    paginationInput,
    user.id,
    accessibleProjectIds
  );
  const tasks = paginated.items;


  const projects = await getProjects(workspaceId, user);
  const isFiltered = hasActiveFilters(filters);

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <BacklogSeen />
      <IssueFiltersBar
        projects={projects}
        initialFilters={filters}
        basePath="/backlog"
        density="compact"
        showProjectFilter="mobile"
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
            ) : projects.some((project) => project.canWrite) ? (
              <CreateIssueButton />
            ) : (
              <span className="text-sm text-white/50">Доступ только для чтения</span>
            )}
          </div>
        </div>
      ) : (
        <>
          <BacklogListClient tasks={tasks} />
          <IssuePagination
            basePath="/backlog"
            page={paginated.page}
            pageSize={paginated.pageSize}
            totalCount={paginated.totalCount}
            totalPages={paginated.totalPages}
            itemCount={tasks.length}
          />
        </>
      )}
    </div>
  );
};

export default BacklogPage;
