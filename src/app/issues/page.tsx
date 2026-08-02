import Link from "next/link";
import IssueRow from "../../components/issues/IssueRow";
import CreateIssueButton from "../../components/issues/CreateIssueButton";
import IssuePagination from "../../components/issues/IssuePagination";
import IssueFiltersBar from "../../components/filters/IssueFiltersBar";
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
import Card from "../../components/ui/Card";
import {
  buildIssueDetailHref,
  clearIssueFiltersHref,
} from "../../shared/issueNavigation";

interface IssuesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const IssuesPage = async ({ searchParams }: IssuesPageProps) => {
  const resolvedSearchParams = await searchParams;
  const filters = parseSearchParams(resolvedSearchParams);
  const paginationInput = parsePaginationParams(resolvedSearchParams);

  const user = await getCurrentUser();
  if (!user) redirect("/signin?redirect=/issues");
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/signin?redirect=/issues");
  const accessibleProjectIds = await getAccessibleProjectIds(user, workspaceId);
  const paginated = await getPaginatedTasks(
    filters,
    paginationInput,
    user.id,
    accessibleProjectIds
  );
  const tasks = paginated.items;
  const projects = await getProjects(workspaceId, user);
  const isFiltered = hasActiveFilters(filters);

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <IssueFiltersBar
        projects={projects}
        initialFilters={filters}
        basePath="/issues"
        density="compact"
        showProjectFilter="mobile"
      />

      {tasks.length === 0 ? (
        <Card variant="surface" className="rounded-2xl p-8 text-center">
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
                href={clearIssueFiltersHref("/issues", resolvedSearchParams)}
                className="rounded-full border border-[rgba(255,255,255,0.14)] px-4 py-2 text-sm text-white/90 hover:bg-white/5 transition-colors"
              >
                Clear filters
              </Link>
            ) : projects.some((project) => project.canWrite) ? (
              <CreateIssueButton />
            ) : (
              <span className="text-sm text-white/50">Доступ только для чтения</span>
            )}
          </div>
        </Card>
      ) : (
        <>
          <Card variant="surface" className="overflow-hidden rounded-2xl p-0">
            {tasks.map((task) => (
              <IssueRow
                key={task.id}
                id={task.id}
                title={task.title}
                issueKey={task.key}
                type={task.type}
                priority={task.priority}     // <-- напрямую Prisma enum
                status={task.status}         // <-- напрямую Prisma enum
                description={task.description}
                createdAt={task.createdAt}
                reporter={task.reporter}
                requesterName={task.requesterName}
                href={buildIssueDetailHref(
                  task.key ?? task.id,
                  resolvedSearchParams,
                  { projectId: task.projectId, from: "list" }
                )}
              />
            ))}
          </Card>
          <IssuePagination
            basePath="/issues"
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

export default IssuesPage;
