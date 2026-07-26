import type { Priority, Status } from "@prisma/client";
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
import { broadcastApiEvent } from "@/server/api/realtime";
import { updateIssueApiSchema } from "@/server/api/schemas";

export const dynamic = "force-dynamic";

type IssueRouteProps = {
  params: Promise<{ key: string }>;
};

async function getIssueByKey(key: string) {
  return prisma.task.findUnique({
    where: { key: key.trim().toUpperCase() },
    select: {
      id: true,
      key: true,
      number: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      status: true,
      tags: true,
      assigneeId: true,
      reporterId: true,
      createdAt: true,
      updatedAt: true,
      isDeleted: true,
      project: {
        select: {
          id: true,
          key: true,
          name: true,
          workspaceId: true,
        },
      },
      assignee: { select: { id: true, name: true, email: true } },
      reporter: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true, email: true } },
      comments: {
        select: {
          id: true,
          text: true,
          userId: true,
          authorName: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      activities: {
        select: {
          id: true,
          type: true,
          fromStatus: true,
          toStatus: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      knowledgeLinks: {
        select: {
          id: true,
          provider: true,
          documentKey: true,
          title: true,
          url: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function GET(request: Request, { params }: IssueRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["issues:read"]);
    const { key } = await params;
    const issue = await getIssueByKey(key);
    if (!issue || issue.isDeleted) {
      throw new ApiError(404, "issue_not_found", "Задача не найдена");
    }
    await requireApiProject(context.user, issue.project.key, "VIEWER");

    return apiData({
      ...issue,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
      comments: issue.comments.map((comment) => ({
        ...comment,
        createdAt: comment.createdAt.toISOString(),
      })),
      activities: issue.activities.map((activity) => ({
        ...activity,
        createdAt: activity.createdAt.toISOString(),
      })),
      knowledgeLinks: issue.knowledgeLinks.map((link) => ({
        ...link,
        createdAt: link.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: IssueRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["issues:write"]);
    const input = updateIssueApiSchema.parse(await readJsonBody(request));
    const { key } = await params;
    const existing = await getIssueByKey(key);
    if (!existing || existing.isDeleted) {
      throw new ApiError(404, "issue_not_found", "Задача не найдена");
    }
    await requireApiProject(context.user, existing.project.key, "MEMBER");

    const updated = await prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id: existing.id },
        data: {
          ...(typeof input.title === "undefined"
            ? {}
            : { title: input.title }),
          ...(typeof input.description === "undefined"
            ? {}
            : { description: input.description }),
          ...(typeof input.status === "undefined"
            ? {}
            : { status: input.status }),
          ...(typeof input.priority === "undefined"
            ? {}
            : { priority: input.priority }),
          ...(typeof input.tags === "undefined"
            ? {}
            : { tags: [...new Set(input.tags)] }),
        },
        select: {
          id: true,
          key: true,
          title: true,
          description: true,
          type: true,
          priority: true,
          status: true,
          tags: true,
          assigneeId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (input.status && input.status !== existing.status) {
        await tx.taskActivity.create({
          data: {
            taskId: task.id,
            type: "STATUS_CHANGED",
            fromStatus: existing.status,
            toStatus: input.status,
            userId: context.user.id,
          },
          select: { id: true },
        });
      }
      await recordApiAudit(tx, context, {
        action: "issue.update",
        resourceType: "issue",
        resourceId: task.id,
        projectId: existing.project.id,
        metadata: {
          key: task.key,
          fields: Object.keys(input),
        },
      });
      return task;
    });

    await broadcastApiEvent(
      existing.project.id,
      existing.project.workspaceId,
      {
        type: "task_updated",
        payload: {
          task: {
            id: updated.id,
            projectId: existing.project.id,
            key: updated.key,
            title: updated.title,
            description: updated.description,
            type: updated.type,
            priority: updated.priority as Priority,
            status: updated.status as Status,
            assigneeId: updated.assigneeId,
            requesterName: null,
            createdAt: updated.createdAt.toISOString(),
          },
        },
      }
    );

    return apiData({
      ...updated,
      project: {
        id: existing.project.id,
        key: existing.project.key,
        name: existing.project.name,
      },
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
