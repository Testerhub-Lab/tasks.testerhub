import Link from "next/link";
import { KnowledgeProvider, ProjectRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import WikiMarkdownEditor from "@/components/wiki/WikiMarkdownEditor";
import { hasProjectRole } from "@/server/auth/access";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import {
  getProjectKnowledge,
  getWikiPage,
  getWikiPageTree,
} from "@/server/knowledge/queries";
import { getProjectByKey } from "@/server/queries/projects";
import { getWikiParentOptions } from "@/server/knowledge/tree";

export const dynamic = "force-dynamic";

type EditWikiPageProps = {
  params: Promise<{ projectKey: string; pageId: string }>;
};

export default async function EditWikiPage({ params }: EditWikiPageProps) {
  const { projectKey, pageId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/signin?redirect=${encodeURIComponent(
        `/wiki/${projectKey}/${pageId}/edit`
      )}`
    );
  }
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/signin");

  const project = await getProjectByKey(projectKey, workspaceId);
  if (!project) notFound();

  const access = await hasProjectRole(user, project.id, ProjectRole.MEMBER, {
    workspaceId,
  });
  if (!access) notFound();

  const [configuration, page, pages] = await Promise.all([
    getProjectKnowledge(project.id),
    getWikiPage(project.id, pageId),
    getWikiPageTree(project.id),
  ]);
  if (configuration.provider !== KnowledgeProvider.NATIVE || !page) notFound();
  const parentOptions = getWikiParentOptions(pages, page.id);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <Link
          href={`/wiki/${project.key}/${page.id}`}
          className="text-xs text-white/45 hover:text-white/70"
        >
          ← {project.key} · {project.name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-white">
          Редактирование страницы
        </h1>
      </div>
      <Card>
        <WikiMarkdownEditor
          key={`${page.id}-${page.version}`}
          projectKey={project.key}
          pageId={page.id}
          initialTitle={page.title}
          initialMarkdown={page.contentMarkdown}
          initialParentId={page.parentId}
          initialVersion={page.version}
          parents={parentOptions}
        />
      </Card>
    </div>
  );
}
