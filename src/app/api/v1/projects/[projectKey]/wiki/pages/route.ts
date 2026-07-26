import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { authenticateApiRequest } from "@/server/api/auth";
import { recordApiAudit } from "@/server/api/audit";
import {
  ApiError,
  apiData,
  apiErrorResponse,
  readJsonBody,
} from "@/server/api/errors";
import {
  getIdempotentResponse,
  requireIdempotencyKey,
  storeIdempotentResponse,
} from "@/server/api/idempotency";
import { requireApiProject } from "@/server/api/projects";
import { createWikiPageApiSchema } from "@/server/api/schemas";
import {
  getUniqueWikiSlug,
  requireNativeWiki,
} from "@/server/api/wiki";

export const dynamic = "force-dynamic";

type ProjectWikiRouteProps = {
  params: Promise<{ projectKey: string }>;
};

export async function GET(
  request: Request,
  { params }: ProjectWikiRouteProps
) {
  try {
    const context = await authenticateApiRequest(request, ["wiki:read"]);
    const { projectKey } = await params;
    const project = await requireApiProject(
      context.user,
      projectKey,
      "VIEWER"
    );
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

    if (project.knowledge.provider !== "NATIVE") {
      return apiData({
        project: {
          id: project.id,
          key: project.key,
          name: project.name,
        },
        knowledge: project.knowledge,
        pages: [],
      });
    }

    const pages = await prisma.wikiPage.findMany({
      where: {
        projectId: project.id,
        archivedAt: null,
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                {
                  contentMarkdown: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        parentId: true,
        title: true,
        slug: true,
        sortOrder: true,
        version: true,
        contentMarkdown: query ? true : false,
        createdAt: true,
        updatedAt: true,
        updatedBy: {
          select: { name: true, email: true },
        },
      },
      orderBy: query
        ? { updatedAt: "desc" }
        : [{ sortOrder: "asc" }, { title: "asc" }],
      take: query ? 50 : undefined,
    });

    return apiData({
      project: {
        id: project.id,
        key: project.key,
        name: project.name,
      },
      knowledge: project.knowledge,
      pages: pages.map((page) => ({
        ...page,
        ...(query
          ? {
              excerpt: page.contentMarkdown
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 500),
            }
          : {}),
        contentMarkdown: undefined,
        createdAt: page.createdAt.toISOString(),
        updatedAt: page.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: ProjectWikiRouteProps
) {
  try {
    const context = await authenticateApiRequest(request, ["wiki:write"]);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = createWikiPageApiSchema.parse(await readJsonBody(request));
    const { projectKey } = await params;
    const project = await requireApiProject(
      context.user,
      projectKey,
      "MEMBER"
    );
    await requireNativeWiki(project);

    if (input.parentId) {
      const parent = await prisma.wikiPage.findFirst({
        where: {
          id: input.parentId,
          projectId: project.id,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (!parent) {
        throw new ApiError(
          400,
          "invalid_parent",
          "Родительская Wiki-страница не найдена"
        );
      }
    }

    const operation = `wiki.page.create:${project.id}`;
    const transactionResult = await prisma.$transaction(async (tx) => {
      const replay = await getIdempotentResponse(
        tx,
        context,
        idempotencyKey,
        operation
      );
      if (replay) {
        return {
          response: replay.response,
          statusCode: replay.statusCode,
        };
      }

      const [slug, lastPage] = await Promise.all([
        getUniqueWikiSlug(project.id, input.title),
        tx.wikiPage.findFirst({
          where: {
            projectId: project.id,
            parentId: input.parentId ?? null,
          },
          select: { sortOrder: true },
          orderBy: { sortOrder: "desc" },
        }),
      ]);
      const page = await tx.wikiPage.create({
        data: {
          projectId: project.id,
          parentId: input.parentId ?? null,
          title: input.title,
          slug,
          contentMarkdown: input.contentMarkdown,
          sortOrder: (lastPage?.sortOrder ?? -1) + 1,
          createdById: context.user.id,
          updatedById: context.user.id,
          revisions: {
            create: {
              version: 1,
              title: input.title,
              contentMarkdown: input.contentMarkdown,
              createdById: context.user.id,
            },
          },
        },
        select: {
          id: true,
          parentId: true,
          title: true,
          slug: true,
          version: true,
          contentMarkdown: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      const response = {
        ...page,
        project: {
          id: project.id,
          key: project.key,
          name: project.name,
        },
        createdAt: page.createdAt.toISOString(),
        updatedAt: page.updatedAt.toISOString(),
      };

      await recordApiAudit(tx, context, {
        action: "wiki.page.create",
        resourceType: "wiki_page",
        resourceId: page.id,
        projectId: project.id,
        metadata: { title: page.title },
      });
      await storeIdempotentResponse(tx, context, {
        key: idempotencyKey,
        operation,
        response: response as Prisma.InputJsonValue,
        statusCode: 201,
      });
      return { response, statusCode: 201 };
    });

    return apiData(
      transactionResult.response,
      transactionResult.statusCode
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
