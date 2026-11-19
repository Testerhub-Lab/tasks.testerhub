import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import Card from "@/components/ui/Card";
import MarkdownView from "@/components/wiki/MarkdownView";
import WorkspaceArticleForm from "@/components/wiki/WorkspaceArticleForm";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { readWorkspaceArticle, workspaceWikiArea } from "@/server/knowledge/workspaceWiki";

export const dynamic = "force-dynamic";

export default async function WorkspaceArticlePage({ params, searchParams }: {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { pageId } = await params;
  const creating = pageId === "new";
  if (!creating && !z.string().uuid().safeParse(pageId).success) notFound();
  const workspaceId = await getCurrentWorkspaceId();
  const user = await getCurrentUser();
  if (!workspaceId || !user) redirect(`/signin?redirect=/wiki/-/${pageId}`);
  const scope = { workspaceId, userId: user.id };
  const article = creating ? null : await readWorkspaceArticle(scope, pageId);
  if (!creating && !article) notFound();
  const area = article ?? await workspaceWikiArea(scope);
  if (!area) notFound();
  const editable = creating || (await searchParams).edit === "1";
  if (editable && !area.canWrite) notFound();
  const page = article ?? { id: randomUUID(), title: "", markdown: "", version: 0 };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/wiki" className="text-sm text-white/65">Wiki / {area.name}</Link>
      <Card>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">{creating ? "Новая страница" : page.title}</h1>
          {!editable && area.canWrite && <Link href={`/wiki/-/${page.id}?edit=1`}>Редактировать</Link>}
        </div>
        {editable ? <WorkspaceArticleForm key={page.id} workspaceId={workspaceId} page={page} />
          : <MarkdownView markdown={page.markdown} />}
      </Card>
    </div>
  );
}
