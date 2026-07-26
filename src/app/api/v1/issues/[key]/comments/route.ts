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
import { broadcastApiEvent } from "@/server/api/realtime";
import { addCommentApiSchema } from "@/server/api/schemas";

export const dynamic = "force-dynamic";

type CommentRouteProps = {
  params: Promise<{ key: string }>;
};

export async function POST(request: Request, { params }: CommentRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["issues:write"]);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = addCommentApiSchema.parse(await readJsonBody(request));
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
            workspaceId: true,
          },
        },
      },
    });
    if (!issue || issue.isDeleted) {
      throw new ApiError(404, "issue_not_found", "Задача не найдена");
    }
    await requireApiProject(context.user, issue.project.key, "MEMBER");
    const operation = `issues.comment:${issue.id}`;

    const transactionResult = await prisma.$transaction(async (tx) => {
      const replay = await getIdempotentResponse(
        tx,
        context,
        idempotencyKey,
        operation
      );
      if (replay) {
        return {
          replayed: true as const,
          response: replay.response,
          statusCode: replay.statusCode,
        };
      }

      const comment = await tx.comment.create({
        data: {
          taskId: issue.id,
          text: input.text,
          userId: context.user.id,
          authorName: null,
        },
        select: {
          id: true,
          taskId: true,
          text: true,
          userId: true,
          authorName: true,
          createdAt: true,
        },
      });
      const response = {
        ...comment,
        user: {
          id: context.user.id,
          name: context.user.name,
          email: context.user.email,
        },
        createdAt: comment.createdAt.toISOString(),
      };

      await recordApiAudit(tx, context, {
        action: "issue.comment.create",
        resourceType: "comment",
        resourceId: comment.id,
        projectId: issue.project.id,
        metadata: { issueKey: issue.key },
      });
      await storeIdempotentResponse(tx, context, {
        key: idempotencyKey,
        operation,
        response: response as Prisma.InputJsonValue,
        statusCode: 201,
      });
      return {
        replayed: false as const,
        response,
        statusCode: 201,
      };
    });

    if (!transactionResult.replayed) {
      const response = transactionResult.response as {
        id: string;
        taskId: string;
        text: string;
        userId: string | null;
        authorName: string | null;
        createdAt: string;
      };
      await broadcastApiEvent(
        issue.project.id,
        issue.project.workspaceId,
        {
          type: "comment_added",
          payload: {
            projectId: issue.project.id,
            comment: response,
          },
        }
      );
    }

    return apiData(
      transactionResult.response,
      transactionResult.statusCode
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
