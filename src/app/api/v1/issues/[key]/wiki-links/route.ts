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
import { linkWikiPageApiSchema } from "@/server/api/schemas";
import { requireNativeWiki } from "@/server/api/wiki";

export const dynamic = "force-dynamic";

type WikiLinkRouteProps = {
  params: Promise<{ key: string }>;
};

export async function POST(request: Request, { params }: WikiLinkRouteProps) {
  try {
    const context = await authenticateApiRequest(request, [
      "issues:write",
      "wiki:read",
    ]);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = linkWikiPageApiSchema.parse(await readJsonBody(request));
    const { key } = await params;
    const issue = await prisma.task.findUnique({
      where: { key: key.trim().toUpperCase() },
      select: {
        id: true,
        key: true,
        isDeleted: true,
        project: {
          select: {
            id: true,
            key: true,
          },
        },
      },
    });
    if (!issue || issue.isDeleted) {
      throw new ApiError(404, "issue_not_found", "Задача не найдена");
    }
    const project = await requireApiProject(
      context.user,
      issue.project.key,
      "MEMBER"
    );
    await requireNativeWiki(project);

    const page = await prisma.wikiPage.findFirst({
      where: {
        id: input.pageId,
        projectId: project.id,
        archivedAt: null,
      },
      select: { id: true, title: true },
    });
    if (!page) {
      throw new ApiError(
        404,
        "wiki_page_not_found",
        "Wiki-страница не найдена"
      );
    }
    const operation = `issues.wiki-link:${issue.id}`;

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

      const link = await tx.knowledgeLink.upsert({
        where: {
          taskId_provider_documentKey: {
            taskId: issue.id,
            provider: "NATIVE",
            documentKey: page.id,
          },
        },
        create: {
          taskId: issue.id,
          projectId: project.id,
          provider: "NATIVE",
          documentKey: page.id,
          title: page.title,
          createdById: context.user.id,
        },
        update: { title: page.title },
        select: {
          id: true,
          provider: true,
          documentKey: true,
          title: true,
          url: true,
          createdAt: true,
        },
      });
      const response = {
        ...link,
        issueKey: issue.key,
        createdAt: link.createdAt.toISOString(),
      };
      await recordApiAudit(tx, context, {
        action: "issue.wiki_link.create",
        resourceType: "knowledge_link",
        resourceId: link.id,
        projectId: project.id,
        metadata: {
          issueKey: issue.key,
          pageId: page.id,
        },
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
