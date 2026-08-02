import Link from "next/link";
import { KnowledgeProvider } from "@prisma/client";
import { redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import prisma from "@/lib/prisma";
import { getAccessibleProjectIds } from "@/server/auth/access";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { getKnowledgeHomeHref } from "@/server/knowledge/providerPolicy";
import {
  getZeroWikiProjectCards,
  usesZeroUiStore,
} from "@/server/ui/zero-legacy";

export const dynamic = "force-dynamic";

const providerLabel = {
  [KnowledgeProvider.DISABLED]: "Отключена",
  [KnowledgeProvider.NATIVE]: "Pulsar Wiki",
  [KnowledgeProvider.EXTERNAL]: "Внешняя Wiki",
};

export default async function WikiPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?redirect=/wiki");
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/signin?redirect=/wiki");

  const projects = usesZeroUiStore()
    ? await getZeroWikiProjectCards(workspaceId, user.id)
    : await (async () => {
        const projectIds = await getAccessibleProjectIds(user, workspaceId);
        return prisma.project.findMany({
          where: { id: { in: projectIds }, workspaceId, archivedAt: null },
          select: {
            id: true,
            key: true,
            name: true,
            knowledge: { select: { provider: true, externalUrl: true } },
            _count: { select: { wikiPages: { where: { archivedAt: null } } } },
          },
          orderBy: { createdAt: "asc" },
        });
      })();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-300/70">
          Knowledge
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Wiki</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/55">
          Документация разделена по продуктам и использует те же права доступа,
          что задачи и доски.
        </p>
      </div>

      {projects.length === 0 ? (
        <Card>
          <p className="text-sm text-white/55">
            У вас пока нет доступных продуктов.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const configuration = project.knowledge ?? {
              provider: KnowledgeProvider.DISABLED,
              externalUrl: null,
            };
            const href = getKnowledgeHomeHref(project.key, configuration);
            const body = (
              <Card className="h-full transition-colors hover:bg-white/[0.045]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-cyan-300/70">
                      {project.key}
                    </div>
                    <h2 className="mt-1 font-semibold text-white">
                      {project.name}
                    </h2>
                  </div>
                  <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wide text-white/45">
                    {providerLabel[configuration.provider]}
                  </span>
                </div>
                <p className="mt-5 text-xs text-white/45">
                  {configuration.provider === KnowledgeProvider.NATIVE
                    ? `${project._count.wikiPages} страниц`
                    : configuration.provider === KnowledgeProvider.EXTERNAL
                      ? "Открывается во внешнем сервисе"
                      : "Настраивается администратором продукта"}
                </p>
              </Card>
            );

            if (!href) return <div key={project.id}>{body}</div>;
            return configuration.provider === KnowledgeProvider.EXTERNAL ? (
              <a key={project.id} href={href} target="_blank" rel="noreferrer">
                {body}
              </a>
            ) : (
              <Link key={project.id} href={href}>
                {body}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
