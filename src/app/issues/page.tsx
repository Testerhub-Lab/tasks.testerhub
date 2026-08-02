import Link from "next/link";
import IssueRow from "../../components/issues/IssueRow";
import CreateIssueButton from "../../components/issues/CreateIssueButton";
import IssuePagination from "../../components/issues/IssuePagination";
import IssueFiltersBar from "../../components/filters/IssueFiltersBar";
import { getPaginatedTasks } from "../../server/queries/tasks";
import { getProjectById, getProjects } from "../../server/queries/projects";
import { getCurrentUser } from "../../server/auth/session";
import { getCurrentWorkspaceId } from "../../server/auth/workspace";
import { getAccessibleProjectIds } from "../../server/auth/access";
import { permanentRedirect, redirect } from "next/navigation";
import {
  hasActiveFilters,
  parsePaginationParams,
  parseSearchParams,
} from "../../server/validators/issueFilters";
import Card from "../../components/ui/Card";
import {
  buildProjectIssueViewHref,
  buildIssueDetailHref,
  clearIssueFiltersHref,
} from "../../shared/issueNavigation";

interface IssuesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function renderIssuesPage({
  searchParams,
  basePath = "/issues",
  projectContext = null,
}: IssuesPageProps & {
  basePath?: string;
  projectContext?: { id: string; key: string } | null;
}) {
  const resolvedSearchParams = await searchParams;
  const effectiveSearchParams = {
    ...resolvedSearchParams,
    ...(projectContext ? { projectId: projectContext.id } : {}),
  };
  const hrefSearchParams = projectContext
    ? Object.fromEntries(
        Object.entries(resolvedSearchParams).filter(([key]) => key !== "projectId")
      )
    : resolvedSearchParams;
  const filters = parseSearchParams(effectiveSearchParams);
  const paginationInput = parsePaginationParams(resolvedSearchParams);

  const user = await getCurrentUser();
  if (!user) redirect(`/signin?redirect=${encodeURIComponent(basePath)}`);
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect(`/signin?redirect=${encodeURIComponent(basePath)}`);
  const legacyProjectId =
    !projectContext && typeof resolvedSearchParams.projectId === "string"
      ? resolvedSearchParams.projectId
      : null;
  if (legacyProjectId) {
    const project = await getProjectById(legacyProjectId, workspaceId, user);
    if (project) {
      permanentRedirect(
        buildProjectIssueViewHref(project.key, "/issues", resolvedSearchParams)
      );
    }
  }
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
        basePath={basePath}
        density="compact"
        showProjectFilter={projectContext ? "never" : "mobile"}
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
                href={clearIssueFiltersHref(basePath, hrefSearchParams, {
                  projectKey: projectContext?.key,
                })}
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
                  hrefSearchParams,
                  {
                    projectId: task.projectId,
                    projectKey: task.project?.key ?? projectContext?.key,
                    from: "list",
                  }
                )}
              />
            ))}
          </Card>
          <IssuePagination
            basePath={basePath}
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
}

const IssuesPage = ({ searchParams }: IssuesPageProps) =>
  renderIssuesPage({ searchParams });

export default IssuesPage;
