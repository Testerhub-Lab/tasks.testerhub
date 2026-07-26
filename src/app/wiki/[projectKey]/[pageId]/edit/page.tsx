import Link from "next/link";
import { KnowledgeProvider, ProjectRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import WikiMarkdownEditor from "@/components/wiki/WikiMarkdownEditor";
import prisma from "@/lib/prisma";
import { hasProjectRole } from "@/server/auth/access";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import {
  getProjectKnowledge,
  getWikiPage,
} from "@/server/knowledge/queries";

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

  const project = await prisma.project.findFirst({
    where: { key: projectKey, workspaceId, archivedAt: null },
    select: { id: true, key: true, name: true },
  });
  if (!project) notFound();

  const access = await hasProjectRole(user, project.id, ProjectRole.MEMBER, {
    workspaceId,
  });
  if (!access) notFound();

  const [configuration, page] = await Promise.all([
    getProjectKnowledge(project.id),
    getWikiPage(project.id, pageId),
  ]);
  if (configuration.provider !== KnowledgeProvider.NATIVE || !page) notFound();

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
        />
      </Card>
    </div>
  );
}
