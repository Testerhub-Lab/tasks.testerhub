import Link from "next/link";
import CreateIssueButton from "../../components/issues/CreateIssueButton";
import BoardClient from "../../components/board/BoardClient";
import IssueFiltersBar from "../../components/filters/IssueFiltersBar";
import { getTasks } from "../../server/queries/tasks";
import { getProjects } from "../../server/queries/projects";
import { getUsersForAssignee } from "../../server/queries/users";
import { getCurrentUser } from "../../server/auth/session";
import { getCurrentWorkspaceId } from "../../server/auth/workspace";
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

  const queryFilters: Filters = {
    ...filters,
    view: "board",
  };

  const user = await getCurrentUser();
  const workspaceId = await getCurrentWorkspaceId();
  const [tasks, users] = await Promise.all([
    getTasks(queryFilters, user?.id ?? null, workspaceId),
    getUsersForAssignee(workspaceId),
  ]);
  const projects = await getProjects(workspaceId);
  const isFiltered = hasActiveFilters(filters);

  return (
    <div className="space-y-3">
      <IssueFiltersBar
        projects={projects}
        initialFilters={filters}
        basePath="/board"
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
        <BoardClient
          tasks={tasks}
          users={users}
          boardId={filters.projectId ?? `workspace:${workspaceId}`}
        />
      )}
    </div>
  );
};

export default BoardPage;
