import type { Prisma, Priority, Status } from "@prisma/client";
import prisma from "@/lib/prisma";
import { authenticateApiRequest } from "@/server/api/auth";
import { recordApiAudit } from "@/server/api/audit";
import {
  apiData,
  apiErrorResponse,
  readJsonBody,
} from "@/server/api/errors";
import {
  getIdempotentResponse,
  requireIdempotencyKey,
  storeIdempotentResponse,
} from "@/server/api/idempotency";
import {
  listAccessibleProjects,
  requireApiProject,
} from "@/server/api/projects";
import { broadcastApiEvent } from "@/server/api/realtime";
import {
  createIssueApiSchema,
  issueStatusSchema,
} from "@/server/api/schemas";

export const dynamic = "force-dynamic";

function serializeIssue(issue: {
  id: string;
  key: string;
  number: number;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  project: { id: string; key: string; name: string };
  assignee: { id: string; name: string | null; email: string } | null;
  reporter: { id: string; name: string | null; email: string } | null;
}) {
  return {
    ...issue,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const context = await authenticateApiRequest(request, ["issues:read"]);
    const url = new URL(request.url);
    const projectKey = url.searchParams.get("projectKey");
    const query = url.searchParams.get("q")?.trim() ?? "";
    const statusValues = url.searchParams
      .getAll("status")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    const parsedStatuses = statusValues.map(
      (status) => issueStatusSchema.parse(status)
    );
    const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
      : 50;

    const projectIds = projectKey
      ? [
          (
            await requireApiProject(
              context.user,
              projectKey,
              "VIEWER"
            )
          ).id,
        ]
      : (await listAccessibleProjects(context.user)).map(
          (project) => project.id
        );

    const issues = await prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        isDeleted: false,
        ...(parsedStatuses.length > 0
          ? { status: { in: parsedStatuses } }
          : {}),
        ...(query
          ? {
              OR: [
                { key: { contains: query, mode: "insensitive" } },
                { title: { contains: query, mode: "insensitive" } },
                {
                  description: {
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
        key: true,
        number: true,
        title: true,
        description: true,
        type: true,
        priority: true,
        status: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        project: { select: { id: true, key: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
        reporter: { select: { id: true, name: true, email: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return apiData(issues.map(serializeIssue));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await authenticateApiRequest(request, ["issues:write"]);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = createIssueApiSchema.parse(await readJsonBody(request));
    const project = await requireApiProject(
      context.user,
      input.projectKey,
      "MEMBER"
    );
    const operation = "issues.create";

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

      const numberedProject = await tx.project.update({
        where: { id: project.id },
        data: { nextIssueNumber: { increment: 1 } },
        select: { id: true, key: true, nextIssueNumber: true },
      });
      const number = numberedProject.nextIssueNumber - 1;
      const key = `${numberedProject.key}-${number}`;
      const task = await tx.task.create({
        data: {
          projectId: numberedProject.id,
          number,
          key,
          title: input.title,
          description: input.description ?? null,
          type: input.type.toUpperCase(),
          priority: input.priority,
          status: "NEW",
          tags: [...new Set(input.tags)],
          creatorId: context.user.id,
          reporterId: context.user.id,
          activities: {
            create: {
              type: "CREATED",
              userId: context.user.id,
            },
          },
        },
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
          createdAt: true,
          updatedAt: true,
        },
      });

      const response = {
        ...task,
        project: {
          id: project.id,
          key: project.key,
          name: project.name,
        },
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      };
      await recordApiAudit(tx, context, {
        action: "issue.create",
        resourceType: "issue",
        resourceId: task.id,
        projectId: project.id,
        metadata: { key: task.key },
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
        key: string;
        title: string;
        description: string | null;
        type: string;
        priority: string;
        status: string;
        tags: string[];
        createdAt: string;
      };
      await broadcastApiEvent(project.id, project.workspaceId, {
        type: "task_created",
        payload: {
          task: {
            id: response.id,
            projectId: project.id,
            key: response.key,
            title: response.title,
            description: response.description,
            type: response.type,
            priority: response.priority as Priority,
            status: response.status as Status,
            assigneeId: null,
            requesterName: null,
            createdAt: response.createdAt,
          },
        },
      });
    }

    return apiData(
      transactionResult.response,
      transactionResult.statusCode
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
