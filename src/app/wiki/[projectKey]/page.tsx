import Link from "next/link";
import { KnowledgeProvider, ProjectRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import WikiCreatePageForm from "@/components/wiki/WikiCreatePageForm";
import WikiArchivedPages from "@/components/wiki/WikiArchivedPages";
import WikiTree from "@/components/wiki/WikiTree";
import {
  getProjectAccess,
  projectRoleAtLeast,
} from "@/server/auth/access";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import {
  getProjectKnowledge,
  getWikiPageTree,
  searchWikiPages,
} from "@/server/knowledge/queries";
import { getProjectByKey } from "@/server/queries/projects";

export const dynamic = "force-dynamic";

type ProjectWikiPageProps = {
  params: Promise<{ projectKey: string }>;
  searchParams: Promise<{ q?: string }>;
};

function getSearchExcerpt(markdown: string, query: string) {
  const plain = markdown.replace(/[#*_>`[\]()~-]/g, " ").replace(/\s+/g, " ");
  const index = plain.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return plain.slice(0, 180);
  return plain.slice(Math.max(0, index - 60), index + query.length + 120);
}

export default async function ProjectWikiPage({
  params,
  searchParams,
}: ProjectWikiPageProps) {
  const [{ projectKey }, { q = "" }] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/signin?redirect=${encodeURIComponent(`/wiki/${projectKey}`)}`
    );
  }
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/signin");

  const project = await getProjectByKey(projectKey, workspaceId);
  if (!project) notFound();

  const access = await getProjectAccess(user, project.id, { workspaceId });
  if (!access) notFound();

  const configuration = await getProjectKnowledge(project.id);
  const canWrite = projectRoleAtLeast(access.role, ProjectRole.MEMBER);

  if (configuration.provider === KnowledgeProvider.EXTERNAL) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="space-y-4 text-center">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-300/70">
            {project.key} · {project.name}
          </div>
          <h1 className="text-2xl font-semibold text-white">Внешняя Wiki</h1>
          <p className="text-sm text-white/55">
            Документация этого проекта подключена как внешний сервис.
          </p>
          {configuration.externalUrl ? (
            <a
              href={configuration.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="button button--primary inline-flex"
            >
              Открыть документацию
            </a>
          ) : null}
        </Card>
      </div>
    );
  }

  if (configuration.provider === KnowledgeProvider.DISABLED) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="space-y-3">
          <h1 className="text-xl font-semibold text-white">
            Wiki проекта {project.key} отключена
          </h1>
          <p className="text-sm text-white/55">
            Администратор проекта может включить нативную Wiki или подключить
            внешний сервис в настройках.
          </p>
          {access.role === ProjectRole.ADMIN ? (
            <Link
              href="/settings/workspace#knowledge"
              className="text-sm text-cyan-300 hover:text-cyan-200"
            >
              Открыть настройки Wiki
            </Link>
          ) : null}
        </Card>
      </div>
    );
  }

  const [allPages, searchResults] = await Promise.all([
    getWikiPageTree(project.id, { includeArchived: true }),
    q.trim() ? searchWikiPages(project.id, q) : Promise.resolve([]),
  ]);
  const pages = allPages.filter((page) => !page.archivedAt);
  const archivedIds = new Set(
    allPages.filter((page) => page.archivedAt).map((page) => page.id)
  );
  const archivedRoots = allPages.filter(
    (page) =>
      page.archivedAt && (!page.parentId || !archivedIds.has(page.parentId))
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/wiki" className="text-xs text-white/45 hover:text-white/70">
            Wiki
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-white">
            {project.key} · {project.name}
          </h1>
        </div>
        <a
          href={`/api/wiki/export/${project.id}`}
          className="text-sm text-cyan-300 hover:text-cyan-200"
        >
          Экспортировать Markdown
        </a>
      </div>

      <form className="flex gap-2" action={`/wiki/${project.key}`}>
        <input
          name="q"
          defaultValue={q}
          className="input"
          placeholder="Поиск по заголовкам и содержимому"
          aria-label="Поиск по Wiki"
        />
        <button type="submit" className="button button--primary">
          Найти
        </button>
      </form>

      {canWrite ? (
        <Card padding="md">
          <WikiCreatePageForm
            projectId={project.id}
            parents={pages.map((page) => ({
              id: page.id,
              title: page.title,
            }))}
          />
        </Card>
      ) : null}

      {q.trim() ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white">
            Результаты поиска · {searchResults.length}
          </h2>
          {searchResults.length === 0 ? (
            <Card>
              <p className="text-sm text-white/50">Ничего не найдено.</p>
            </Card>
          ) : (
            searchResults.map((page) => (
              <Link
                key={page.id}
                href={`/wiki/${project.key}/${page.id}`}
                className="block"
              >
                <Card padding="md" className="hover:bg-white/[0.04]">
                  <h3 className="font-medium text-white">{page.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-white/45">
                    {getSearchExcerpt(page.contentMarkdown, q)}
                  </p>
                </Card>
              </Link>
            ))
          )}
        </section>
      ) : pages.length === 0 ? (
        <Card>
          <p className="text-sm text-white/50">
            В этом проекте пока нет страниц.
          </p>
        </Card>
      ) : (
        <Card>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
            Страницы
          </h2>
          <WikiTree projectKey={project.key} pages={pages} />
        </Card>
      )}
      {canWrite ? (
        <WikiArchivedPages
          pages={archivedRoots.map((page) => ({
            id: page.id,
            title: page.title,
          }))}
        />
      ) : null}
    </div>
  );
}
