import Link from "next/link";
import CreateIssueButton from "../../components/issues/CreateIssueButton";
import BoardClient from "../../components/board/BoardClient";
import IssueFiltersBar from "../../components/filters/IssueFiltersBar";
import { getBoardTaskColumns } from "../../server/queries/tasks";
import { getProjects } from "../../server/queries/projects";
import { getUsersForAssignee } from "../../server/queries/users";
import { getCurrentUser } from "../../server/auth/session";
import { getCurrentWorkspaceId } from "../../server/auth/workspace";
import { getAccessibleProjectIds } from "../../server/auth/access";
import { redirect } from "next/navigation";
import {
  BOARD_COLUMN_LIMIT_DEFAULT,
  BOARD_COLUMN_LIMIT_MAX,
  BOARD_COLUMN_LIMIT_PARAM,
  hasActiveFilters,
  parseBoardColumnLimitParams,
  parseSearchParams,
  type BoardColumnStatus,
} from "../../server/validators/issueFilters";

interface BoardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function boardColumnLimitHref(
  searchParams: Record<string, string | string[] | undefined>,
  status: BoardColumnStatus,
  nextLimit: number
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value) {
      params.set(key, value);
    }
  }
  params.set(BOARD_COLUMN_LIMIT_PARAM[status], String(nextLimit));
  const query = params.toString();
  return query ? `/board?${query}` : "/board";
}

const BoardPage = async ({ searchParams }: BoardPageProps) => {
  const resolvedSearchParams = await searchParams;
  const filters = parseSearchParams(resolvedSearchParams);
  const boardColumnLimits = parseBoardColumnLimitParams(resolvedSearchParams);

  type Filters = ReturnType<typeof parseSearchParams>;

  const queryFilters: Filters = {
    ...filters,
    view: "board",
  };

  const user = await getCurrentUser();
  if (!user) redirect("/signin?redirect=/board");
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/signin?redirect=/board");
  const accessibleProjectIds = await getAccessibleProjectIds(user, workspaceId);
  const [boardColumns, users] = await Promise.all([
    getBoardTaskColumns(
      queryFilters,
      boardColumnLimits,
      user.id,
      accessibleProjectIds
    ),
    getUsersForAssignee(workspaceId, accessibleProjectIds),
  ]);
  const tasks = boardColumns.flatMap((column) => column.items);
  const projects = await getProjects(workspaceId, user);
  const isFiltered = hasActiveFilters(filters);

  return (
    <div className="space-y-3">
      <IssueFiltersBar
        projects={projects}
        initialFilters={filters}
        basePath="/board"
        density="compact"
        variant="toolbar"
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
                href="/board"
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
        <BoardClient
          tasks={tasks}
          columns={boardColumns.map((column) => ({
            status: column.status,
            totalCount: column.totalCount,
            hasMore: column.hasMore,
            loadMoreHref:
              column.hasMore && column.limit < BOARD_COLUMN_LIMIT_MAX
              ? boardColumnLimitHref(
                  resolvedSearchParams,
                  column.status,
                  Math.min(
                    column.limit + BOARD_COLUMN_LIMIT_DEFAULT,
                    BOARD_COLUMN_LIMIT_MAX
                  )
                )
              : null,
          }))}
          users={users}
          boardId={filters.projectId ?? null}
          editableProjectIds={projects
            .filter((project) => project.canWrite)
            .map((project) => project.id)}
        />
      )}
    </div>
  );
};

export default BoardPage;
