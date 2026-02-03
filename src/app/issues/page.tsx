import Link from "next/link";
import IssueRow from "../../components/issues/IssueRow";
import CreateIssueButton from "../../components/issues/CreateIssueButton";
import IssueFiltersBar from "../../components/filters/IssueFiltersBar";
import { getTasks } from "../../server/queries/tasks";
import { getProjects } from "../../server/queries/projects";
import {
  hasActiveFilters,
  parseSearchParams,
} from "../../server/validators/issueFilters";
import Card from "../../components/ui/Card";

interface IssuesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const IssuesPage = async ({ searchParams }: IssuesPageProps) => {
  const resolvedSearchParams = await searchParams;
  const filters = parseSearchParams(resolvedSearchParams);

  const tasks = await getTasks(filters);
  const projects = await getProjects();
  const isFiltered = hasActiveFilters(filters);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">List</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Табличное представление для контроля статусов.
          </p>
        </div>
        <div className="text-sm text-[var(--color-text-secondary)]">
          {tasks.length} issues
        </div>
      </div>

      <IssueFiltersBar projects={projects} initialFilters={filters} basePath="/issues" />

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
                href="/issues"
                className="rounded-full border border-[rgba(255,255,255,0.14)] px-4 py-2 text-sm text-white/90 hover:bg-white/5 transition-colors"
              >
                Clear filters
              </Link>
            ) : (
              <CreateIssueButton />
            )}
          </div>
        </Card>
      ) : (
        <Card variant="surface" className="overflow-hidden rounded-2xl p-0">
          {tasks.map((task) => (
            <IssueRow
              key={task.id}
              id={task.id}
              title={task.title}
              issueKey={task.key}
              priority={task.priority}     // <-- напрямую Prisma enum
              status={task.status}         // <-- напрямую Prisma enum
              description={task.description}
              createdAt={task.createdAt}
              reporter={task.reporter}
              requesterName={task.requesterName}
              href={`/tasks/${task.key ?? task.id}`}
            />
          ))}
        </Card>
      )}
    </div>
  );
};

export default IssuesPage;
