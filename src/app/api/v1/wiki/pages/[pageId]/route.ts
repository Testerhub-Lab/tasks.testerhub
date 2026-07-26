import prisma from "@/lib/prisma";
import { authenticateApiRequest } from "@/server/api/auth";
import { recordApiAudit } from "@/server/api/audit";
import {
  ApiError,
  apiData,
  apiErrorResponse,
  readJsonBody,
} from "@/server/api/errors";
import { requireApiProject } from "@/server/api/projects";
import { updateWikiPageApiSchema } from "@/server/api/schemas";
import { requireNativeWiki } from "@/server/api/wiki";

export const dynamic = "force-dynamic";

type WikiPageRouteProps = {
  params: Promise<{ pageId: string }>;
};

async function getPage(pageId: string) {
  return prisma.wikiPage.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      projectId: true,
      parentId: true,
      title: true,
      slug: true,
      contentMarkdown: true,
      version: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { name: true, email: true } },
      updatedBy: { select: { name: true, email: true } },
      project: {
        select: {
          id: true,
          key: true,
          name: true,
          workspaceId: true,
          knowledge: {
            select: { provider: true, externalUrl: true },
          },
        },
      },
      revisions: {
        select: {
          id: true,
          version: true,
          title: true,
          createdAt: true,
          createdBy: { select: { name: true, email: true } },
        },
        orderBy: { version: "desc" },
        take: 30,
      },
    },
  });
}

export async function GET(request: Request, { params }: WikiPageRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["wiki:read"]);
    const { pageId } = await params;
    const page = await getPage(pageId);
    if (!page || page.archivedAt) {
      throw new ApiError(404, "wiki_page_not_found", "Wiki-страница не найдена");
    }
    const project = await requireApiProject(
      context.user,
      page.project.key,
      "VIEWER"
    );
    await requireNativeWiki(project);

    return apiData({
      ...page,
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
      revisions: page.revisions.map((revision) => ({
        ...revision,
        createdAt: revision.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: WikiPageRouteProps
) {
  try {
    const context = await authenticateApiRequest(request, ["wiki:write"]);
    const input = updateWikiPageApiSchema.parse(await readJsonBody(request));
    const { pageId } = await params;
    const existing = await getPage(pageId);
    if (!existing || existing.archivedAt) {
      throw new ApiError(404, "wiki_page_not_found", "Wiki-страница не найдена");
    }
    const project = await requireApiProject(
      context.user,
      existing.project.key,
      "MEMBER"
    );
    await requireNativeWiki(project);
    const title = input.title ?? existing.title;
    const contentMarkdown =
      input.contentMarkdown ?? existing.contentMarkdown;
    const updated = await prisma.$transaction(async (tx) => {
      const updateData = {
        title,
        contentMarkdown,
        updatedById: context.user.id,
        version: { increment: 1 },
      };
      if (input.expectedVersion) {
        const result = await tx.wikiPage.updateMany({
          where: {
            id: existing.id,
            archivedAt: null,
            version: input.expectedVersion,
          },
          data: updateData,
        });
        if (result.count === 0) {
          const current = await tx.wikiPage.findUnique({
            where: { id: existing.id },
            select: { version: true },
          });
          throw new ApiError(
            409,
            "version_conflict",
            `Страница уже имеет версию ${current?.version ?? "новее ожидаемой"}`
          );
        }
      } else {
        await tx.wikiPage.update({
          where: { id: existing.id },
          data: updateData,
          select: { id: true },
        });
      }

      const page = await tx.wikiPage.findUniqueOrThrow({
        where: { id: existing.id },
        select: {
          id: true,
          parentId: true,
          title: true,
          slug: true,
          contentMarkdown: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await tx.wikiPageRevision.create({
        data: {
          pageId: page.id,
          version: page.version,
          title,
          contentMarkdown,
          createdById: context.user.id,
        },
        select: { id: true },
      });
      await tx.knowledgeLink.updateMany({
        where: {
          projectId: project.id,
          provider: "NATIVE",
          documentKey: page.id,
        },
        data: { title },
      });
      await recordApiAudit(tx, context, {
        action: "wiki.page.update",
        resourceType: "wiki_page",
        resourceId: page.id,
        projectId: project.id,
        metadata: {
          fromVersion: page.version - 1,
          toVersion: page.version,
        },
      });
      return page;
    });

    return apiData({
      ...updated,
      project: {
        id: project.id,
        key: project.key,
        name: project.name,
      },
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
