import Link from "next/link";
import { KnowledgeProvider, ProjectRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import MarkdownView from "@/components/wiki/MarkdownView";
import WikiPageActions from "@/components/wiki/WikiPageActions";
import WikiRevisionActions from "@/components/wiki/WikiRevisionActions";
import WikiReviewSurface from "@/components/wiki/WikiReviewSurface";
import WikiWorkflowPanel from "@/components/wiki/WikiWorkflowPanel";
import WikiTableOfContents from "@/components/wiki/WikiTableOfContents";
import {
  getProjectAccess,
  projectRoleAtLeast,
} from "@/server/auth/access";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import {
  getProjectKnowledge,
  getWikiCommentThreads,
  getWikiPage,
  getWikiPageRevisions,
  getWikiPageTree,
  getWikiReviewDecisions,
} from "@/server/knowledge/queries";
import { getProjectByKey } from "@/server/queries/projects";
import { getWikiReviewersForProject } from "@/server/queries/users";
import { getWikiBreadcrumbs } from "@/server/knowledge/tree";

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

  const [configuration, page, pages, revisions, decisions, commentThreads, reviewers] = await Promise.all([
    getProjectKnowledge(project.id),
    getWikiPage(project.id, pageId),
    getWikiPageTree(project.id),
    getWikiPageRevisions(pageId),
    getWikiReviewDecisions(pageId),
    getWikiCommentThreads(pageId),
    getWikiReviewersForProject(workspaceId, project.id),
  ]);
  if (!page) notFound();

  const canEdit =
    configuration.provider === KnowledgeProvider.NATIVE &&
    projectRoleAtLeast(access.role, ProjectRole.MEMBER);
  const canApprove =
    configuration.provider === KnowledgeProvider.NATIVE &&
    (projectRoleAtLeast(access.role, ProjectRole.ADMIN) ||
      page.reviewAssigneeId === user.id);
  const author =
    page.updatedBy?.name || page.updatedBy?.email || "Неизвестный пользователь";
  const breadcrumbs = getWikiBreadcrumbs(pages, page.id);

  return (
    <div className="mx-auto max-w-7xl">
      <main className="min-w-0 space-y-4">
        {configuration.provider !== KnowledgeProvider.NATIVE ? (
          <div className="rounded-md border border-amber-300/15 bg-amber-300/5 px-4 py-3 text-sm text-amber-100/75">
            Нативная Wiki сейчас неактивна. Сохранённая страница доступна только
            для чтения.
          </div>
        ) : null}
        <Card>
          {breadcrumbs.length > 1 ? (
            <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-white/40" aria-label="Путь Wiki-страницы">
              {breadcrumbs.map((breadcrumb, index) => (
                <span key={breadcrumb.id} className="flex items-center gap-1">
                  {index > 0 ? <span aria-hidden="true">/</span> : null}
                  {breadcrumb.id === page.id ? (
                    <span className="text-white/60">{breadcrumb.title}</span>
                  ) : (
                    <Link
                      href={`/wiki/${encodeURIComponent(project.key)}/${breadcrumb.id}`}
                      className="hover:text-white/70"
                    >
                      {breadcrumb.title}
                    </Link>
                  )}
                </span>
              ))}
            </nav>
          ) : null}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/6 pb-4">
            <div>
              <h1 className="text-2xl font-semibold text-white">{page.title}</h1>
              <p className="mt-2 text-xs text-white/40">
                Версия {page.version} · {author} ·{" "}
                {page.updatedAt.toLocaleString("ru-RU")}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <WikiWorkflowPanel
                pageId={page.id}
                status={page.workflowStatus}
                reviewVersion={page.reviewVersion}
                approvedVersion={page.approvedVersion}
                requestedByName={page.reviewRequestedBy?.name ?? null}
                requestedAt={page.reviewRequestedAt?.toISOString() ?? null}
                assignee={page.reviewAssignee}
                reviewers={reviewers}
                canEdit={canEdit}
                canApprove={canApprove}
                decisions={decisions.map((decision) => ({
                  id: decision.id,
                  decision: decision.decision,
                  comment: decision.comment,
                  createdAt: decision.createdAt.toISOString(),
                  version: decision.version,
                  reviewerName: decision.reviewer.name,
                }))}
              />
              <WikiPageActions
                projectKey={project.key}
                pageId={page.id}
                canEdit={canEdit}
              />
            </div>
          </div>
          <div className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1fr)_240px]">
            <div className="min-w-0">
              <WikiReviewSurface
                pageId={page.id}
                currentMarkdown={page.contentMarkdown}
                canComment={canEdit}
                threads={commentThreads.map((thread) => ({
                  id: thread.id,
                  revisionVersion: thread.revisionVersion,
                  anchorQuote: thread.anchorQuote,
                  status: thread.status,
                  createdAt: thread.createdAt.toISOString(),
                  createdByName: thread.createdBy.name,
                  resolvedAt: thread.resolvedAt?.toISOString() ?? null,
                  comments: thread.comments.map((comment) => ({
                    id: comment.id,
                    body: comment.body,
                    createdAt: comment.createdAt.toISOString(),
                    authorName: comment.author.name,
                  })),
                }))}
              >
                <MarkdownView markdown={page.contentMarkdown} />
              </WikiReviewSurface>
            </div>
            <aside className="hidden xl:block">
              <div className="sticky top-24">
                <WikiTableOfContents markdown={page.contentMarkdown} />
              </div>
            </aside>
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
