import Link from "next/link";
import { KnowledgeProvider, ProjectRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import MarkdownView from "@/components/wiki/MarkdownView";
import WikiPageActions from "@/components/wiki/WikiPageActions";
import WikiRevisionActions from "@/components/wiki/WikiRevisionActions";
import WikiTree from "@/components/wiki/WikiTree";
import {
  getProjectAccess,
  projectRoleAtLeast,
} from "@/server/auth/access";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import {
  getProjectKnowledge,
  getWikiPage,
  getWikiPageRevisions,
  getWikiPageTree,
} from "@/server/knowledge/queries";
import { getProjectByKey } from "@/server/queries/projects";

export const dynamic = "force-dynamic";

type WikiDocumentPageProps = {
  params: Promise<{ projectKey: string; pageId: string }>;
};

export default async function WikiDocumentPage({
  params,
}: WikiDocumentPageProps) {
  const { projectKey, pageId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/signin?redirect=${encodeURIComponent(`/wiki/${projectKey}/${pageId}`)}`
    );
  }
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/signin");

  const project = await getProjectByKey(projectKey, workspaceId, {
    includeArchived: true,
  });
  if (!project) notFound();

  const access = await getProjectAccess(user, project.id, {
    workspaceId,
    includeArchived: true,
  });
  if (!access) notFound();

  const [configuration, page, pages, revisions] = await Promise.all([
    getProjectKnowledge(project.id),
    getWikiPage(project.id, pageId),
    getWikiPageTree(project.id),
    getWikiPageRevisions(pageId),
  ]);
  if (!page) notFound();

  const canEdit =
    configuration.provider === KnowledgeProvider.NATIVE &&
    projectRoleAtLeast(access.role, ProjectRole.MEMBER);
  const author =
    page.updatedBy?.name || page.updatedBy?.email || "Неизвестный пользователь";

  return (
    <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="h-fit lg:sticky lg:top-24">
        <Card padding="md">
          <Link
            href={`/wiki/${project.key}`}
            className="mb-3 block text-xs font-semibold text-cyan-300/75 hover:text-cyan-200"
          >
            {project.key} · {project.name}
          </Link>
          <WikiTree
            projectKey={project.key}
            pages={pages}
            activePageId={page.id}
          />
        </Card>
      </aside>

      <main className="min-w-0 space-y-4">
        {configuration.provider !== KnowledgeProvider.NATIVE ? (
          <div className="rounded-md border border-amber-300/15 bg-amber-300/5 px-4 py-3 text-sm text-amber-100/75">
            Нативная Wiki сейчас неактивна. Сохранённая страница доступна только
            для чтения.
          </div>
        ) : null}
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/6 pb-4">
            <div>
              <h1 className="text-2xl font-semibold text-white">{page.title}</h1>
              <p className="mt-2 text-xs text-white/40">
                Версия {page.version} · {author} ·{" "}
                {page.updatedAt.toLocaleString("ru-RU")}
              </p>
            </div>
            <WikiPageActions
              projectKey={project.key}
              pageId={page.id}
              canEdit={canEdit}
            />
          </div>
          <div className="pt-6">
            <MarkdownView markdown={page.contentMarkdown} />
          </div>
        </Card>

        <details className="surface rounded-[var(--radius-md)] p-4">
          <summary className="cursor-pointer text-sm font-medium text-white/70">
            История версий ({revisions.length})
          </summary>
          <div className="mt-3 divide-y divide-white/5">
            {revisions.map((revision) => (
              <div
                key={revision.id}
                className="flex items-center justify-between gap-3 py-2 text-xs"
              >
                <div>
                  <span className="text-white/75">Версия {revision.version}</span>
                  <span className="ml-2 text-white/35">
                    {revision.createdBy?.name ||
                      revision.createdBy?.email ||
                      "Неизвестный пользователь"}{" "}
                    ·{" "}
                    {revision.createdAt.toLocaleString("ru-RU")}
                  </span>
                </div>
                {canEdit && revision.version !== page.version ? (
                  <WikiRevisionActions
                    pageId={page.id}
                    revisionId={revision.id}
                    version={revision.version}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </details>
      </main>
    </div>
  );
}
