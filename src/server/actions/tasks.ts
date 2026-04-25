// src/server/actions/tasks.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import prisma from "../../lib/prisma";
import { sseManager } from "../../lib/sse";
import type { RealtimeEvent } from "../../types/realtime";
import { ActivityType, Status } from "@prisma/client";
import { getCurrentUser } from "../auth/session";
import { getCurrentWorkspaceId } from "../auth/workspace";
import {
  canChangePriority,
  canChangeStatus,
  canComment,
  canCreateTask,
  type Role,
} from "../auth/permissions";
import {
  taskSchema,
  taskStatusSchema,
  taskPrioritySchema,
  type TaskInput,
  type TaskPriority,
} from "../validators/task";

const updateStatusSchema = z.object({
  id: z.string().cuid(),
  status: taskStatusSchema,
});

const updateFieldsSchema = z
  .object({
    id: z.string().cuid(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional().nullable(),
    assigneeId: z.string().optional().nullable(),
  })
  .refine(
    (data) =>
      data.status ||
      data.priority ||
      typeof data.title !== "undefined" ||
      typeof data.description !== "undefined" ||
      typeof data.assigneeId !== "undefined",
    {
      message: "At least one field must be provided.",
    }
  );

const addCommentSchema = z.object({
  taskId: z.string().cuid(),
  text: z.string().min(1).max(2000),
  authorName: z.string().max(120).optional(),
});

const taskDeleteSchema = z.object({
  taskId: z.string().cuid(),
});

function buildDescription(base: string | null | undefined, extra: string[]) {
  const cleanBase = (base ?? "").trim();
  const cleanExtra = extra.map((x) => x.trim()).filter(Boolean);

  if (!cleanBase && cleanExtra.length === 0) return null;
  if (!cleanBase) return cleanExtra.join("\n\n");
  if (cleanExtra.length === 0) return cleanBase;
  return `${cleanBase}\n\n${cleanExtra.join("\n\n")}`;
}

async function broadcastTaskEvent(
  projectId: string,
  workspaceId: string,
  event: RealtimeEvent
) {
  await Promise.all([
    sseManager.broadcast(projectId, event),
    sseManager.broadcast(`workspace:${workspaceId}`, event),
  ]);
}

async function canManageTaskDeletion(params: {
  taskId: string;
  currentUserId: string | null;
  workspaceId: string;
  currentUserRole: "ADMIN" | "USER" | null;
}) {
  const task = await prisma.task.findFirst({
    where: { id: params.taskId },
    select: {
      id: true,
      key: true,
      status: true,
      projectId: true,
      creatorId: true,
      isDeleted: true,
      project: { select: { workspaceId: true } },
    },
  });

  if (!task || task.project.workspaceId !== params.workspaceId) {
    return { ok: false as const, formError: "Недоступно" };
  }

  const isCreator = Boolean(params.currentUserId && task.creatorId === params.currentUserId);
  const isGlobalAdmin = params.currentUserRole === "ADMIN";
  let isWorkspaceAdmin = false;

  if (params.currentUserId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: task.project.workspaceId,
          userId: params.currentUserId,
        },
      },
      select: { role: true },
    });
    isWorkspaceAdmin = membership?.role === "ADMIN";
  }

  if (!isCreator && !isWorkspaceAdmin && !isGlobalAdmin) {
    return { ok: false as const, formError: "Недостаточно прав" };
  }

  return { ok: true as const, task };
}

export async function createTaskAction(data: TaskInput) {
  try {
    const validated = taskSchema.parse(data);
    const authUser = await getCurrentUser();
    const role: Role =
      authUser?.role === "ADMIN" ? "admin" : authUser ? "user" : "guest";

    const workspaceId = await getCurrentWorkspaceId();
    const project = await prisma.project.findFirst({
      where: { id: validated.projectId, workspaceId },
      select: {
        id: true,
        workspaceId: true,
        key: true,
        nextIssueNumber: true,
        allowGuest: true,
        archivedAt: true,
      },
    });

    if (!project) {
      return { ok: false as const, formError: "Project not found" };
    }
    if (project.archivedAt) {
      return { ok: false as const, formError: "Проект архивирован" };
    }

    if (
      !canCreateTask({
        role,
        projectAllowGuest: project.allowGuest,
      })
    ) {
      return { ok: false as const, formError: "Требуется авторизация" };
    }

    const trimmedRequesterName = validated.requesterName?.trim() || null;
    const isAuth = Boolean(authUser);
    const isGuest = !isAuth;
    const effectiveReporterId = isAuth ? authUser!.id : null;
    const effectiveRequesterName = isAuth ? null : (trimmedRequesterName ?? "Гость");

    if (isGuest && !project.allowGuest) {
      return { ok: false as const, formError: "Гостевой режим для проекта запрещён" };
    }

    // guest name defaults to "Гость", so no extra validation here

    if (process.env.NODE_ENV !== "production") {
      console.info("[createTask] reporter resolved", { mode: authUser ? "auth" : "guest" });
    }

    // Пока нет отдельных колонок steps/expected/actual/environment — складываем в description
    const extraBlocks = [
      validated.steps ? `Шаги:\n${validated.steps}` : "",
      validated.expected ? `Ожидаемое:\n${validated.expected}` : "",
      validated.actual ? `Фактическое:\n${validated.actual}` : "",
      validated.environment ? `Окружение:\n${validated.environment}` : "",
    ].filter(Boolean);

    const finalDescription = buildDescription(validated.description, extraBlocks);

    const txResult = await prisma.$transaction(async (tx) => {
      const updatedProject = await tx.project.update({
        where: { id: project.id },
        data: { nextIssueNumber: { increment: 1 } },
        select: { id: true, key: true, nextIssueNumber: true },
      });

      const nextNumber = updatedProject.nextIssueNumber - 1;
      const taskKey = `${updatedProject.key}-${nextNumber}`;

      const created = await tx.task.create({
        data: {
          title: validated.title,
          description: finalDescription,

          type: validated.type,
          priority: validated.priority,
          status: Status.NEW, // фиксируем NEW на создание (можно поменять, если нужно)

          tags: validated.tags,
          attachments: validated.attachments,

          dueDate: validated.dueDate ?? null,

          reporterId: effectiveReporterId,
          creatorId: authUser?.id ?? null,
          assigneeId: validated.assigneeId ?? null,

          requesterName: effectiveRequesterName,
          requesterEmail: validated.requesterEmail?.trim() ?? null,

          projectId: updatedProject.id,
          number: nextNumber,
          key: taskKey,
        },
        select: {
          id: true,
          projectId: true,
          key: true,
          title: true,
          description: true,
          type: true,
          priority: true,
          status: true,
          assigneeId: true,
          requesterName: true,
          createdAt: true,
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId: created.id,
          type: ActivityType.CREATED,
          userId: authUser?.id ?? null,
          authorName: authUser ? null : effectiveRequesterName,
        },
        select: { id: true },
      });

      return {
        id: created.id,
        key: taskKey,
        projectId: created.projectId,
        title: created.title,
        description: created.description,
        type: created.type,
        priority: created.priority,
        status: created.status,
        assigneeId: created.assigneeId,
        requesterName: created.requesterName,
        createdAt: created.createdAt,
      };
    });

    await broadcastTaskEvent(txResult.projectId, project.workspaceId, {
      type: "task_created",
      payload: {
        task: {
          id: txResult.id,
          projectId: txResult.projectId,
          key: txResult.key,
          title: txResult.title,
          description: txResult.description,
          type: txResult.type,
          priority: txResult.priority,
          status: txResult.status,
          assigneeId: txResult.assigneeId,
          requesterName: txResult.requesterName,
          createdAt: txResult.createdAt.toISOString(),
        },
      },
    });

    revalidatePath("/board");
    revalidatePath("/backlog");
    revalidatePath("/issues");

    return { ok: true as const, id: txResult.id, key: txResult.key };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false as const, formError: "Произошла ошибка при создании задачи." };
  }
}

export async function updateTaskStatusAction(data: {
  id: string;
  status: z.infer<typeof taskStatusSchema>;
}) {
  try {
    const validatedData = updateStatusSchema.parse(data);
    const authUser = await getCurrentUser();
    const role: Role =
      authUser?.role === "ADMIN" ? "admin" : authUser ? "user" : "guest";

    const workspaceId = await getCurrentWorkspaceId();
    const taskProject = await prisma.task.findFirst({
      where: { id: validatedData.id, isDeleted: false },
      select: {
        projectId: true,
        project: { select: { allowGuest: true, workspaceId: true } },
      },
    });
    if (taskProject?.project?.workspaceId !== workspaceId) {
      return { ok: false as const, formError: "Недоступно" };
    }

    if (
      !canChangeStatus({
        role,
        projectAllowGuest: taskProject?.project?.allowGuest,
      })
    ) {
      return { ok: false as const, formError: "Требуется авторизация" };
    }

    const existing = await prisma.task.findUnique({
      where: { id: validatedData.id },
      select: { status: true },
    });

    const updatedTask = await prisma.task.update({
      where: { id: validatedData.id },
      data: { status: validatedData.status },
      select: {
        id: true,
        projectId: true,
        key: true,
        title: true,
        description: true,
        type: true,
        priority: true,
        status: true,
        assigneeId: true,
        requesterName: true,
        createdAt: true,
      },
    });

    if (existing?.status && existing.status !== validatedData.status) {
      await prisma.taskActivity.create({
        data: {
          taskId: validatedData.id,
          type: ActivityType.STATUS_CHANGED,
          fromStatus: existing.status,
          toStatus: validatedData.status,
          userId: authUser?.id ?? null,
          authorName: authUser ? null : "Гость",
        },
        select: { id: true },
      });
    }

    await broadcastTaskEvent(updatedTask.projectId, taskProject.project.workspaceId, {
      type: "task_updated",
      payload: {
        task: {
          id: updatedTask.id,
          projectId: updatedTask.projectId,
          key: updatedTask.key,
          title: updatedTask.title,
          description: updatedTask.description,
          type: updatedTask.type,
          priority: updatedTask.priority,
          status: updatedTask.status,
          assigneeId: updatedTask.assigneeId,
          requesterName: updatedTask.requesterName,
          createdAt: updatedTask.createdAt.toISOString(),
        },
      },
    });

    revalidatePath("/board");
    revalidatePath("/backlog");
    revalidatePath("/issues");

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false as const, formError: "Не удалось обновить статус." };
  }
}

export async function updateTaskFieldsAction(data: {
  id: string;
  status?: z.infer<typeof taskStatusSchema>;
  priority?: TaskPriority;
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
}) {
  try {
    const validatedData = updateFieldsSchema.parse(data);
    const authUser = await getCurrentUser();
    const role: Role =
      authUser?.role === "ADMIN" ? "admin" : authUser ? "user" : "guest";

    const workspaceId = await getCurrentWorkspaceId();
    const taskProject = await prisma.task.findFirst({
      where: { id: validatedData.id, isDeleted: false },
      select: {
        projectId: true,
        project: { select: { allowGuest: true, workspaceId: true } },
      },
    });
    if (taskProject?.project?.workspaceId !== workspaceId) {
      return { ok: false as const, formError: "Недоступно" };
    }

    if (
      (validatedData.status &&
        !canChangeStatus({
          role,
          projectAllowGuest: taskProject?.project?.allowGuest,
        })) ||
      (validatedData.priority &&
        !canChangePriority({
          role,
          projectAllowGuest: taskProject?.project?.allowGuest,
        })) ||
      ((typeof validatedData.title !== "undefined" ||
        typeof validatedData.description !== "undefined" ||
        typeof validatedData.assigneeId !== "undefined") &&
        !canChangeStatus({
          role,
          projectAllowGuest: taskProject?.project?.allowGuest,
        }))
    ) {
      return { ok: false as const, formError: "Требуется авторизация" };
    }

    const existing = await prisma.task.findUnique({
      where: { id: validatedData.id },
      select: { status: true, key: true },
    });

    const updated = await prisma.task.update({
      where: { id: validatedData.id },
      data: {
        status: validatedData.status,
        priority: validatedData.priority,
        title: validatedData.title,
        description: validatedData.description,
        assigneeId:
          typeof validatedData.assigneeId !== "undefined"
            ? validatedData.assigneeId
            : undefined,
      },
      select: {
        id: true,
        projectId: true,
        key: true,
        title: true,
        description: true,
        type: true,
        priority: true,
        status: true,
        assigneeId: true,
        requesterName: true,
        createdAt: true,
      },
    });

    if (
      typeof validatedData.status !== "undefined" &&
      existing?.status &&
      existing.status !== validatedData.status
    ) {
      await prisma.taskActivity.create({
        data: {
          taskId: validatedData.id,
          type: ActivityType.STATUS_CHANGED,
          fromStatus: existing.status,
          toStatus: validatedData.status,
          userId: authUser?.id ?? null,
          authorName: authUser ? null : "Гость",
        },
        select: { id: true },
      });
    }

    await broadcastTaskEvent(taskProject.projectId, taskProject.project.workspaceId, {
      type: "task_updated",
      payload: {
        task: {
          id: updated.id,
          projectId: updated.projectId,
          key: updated.key,
          title: updated.title,
          description: updated.description,
          type: updated.type,
          priority: updated.priority,
          status: updated.status,
          assigneeId: updated.assigneeId,
          requesterName: updated.requesterName,
          createdAt: updated.createdAt.toISOString(),
        },
      },
    });

    revalidatePath(`/tasks/${updated.key ?? validatedData.id}`);
    revalidatePath("/board");
    revalidatePath("/backlog");
    revalidatePath("/issues");

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false as const, formError: "Не удалось обновить задачу." };
  }
}

export async function addCommentAction(data: {
  taskId: string;
  text: string;
  authorName?: string;
}) {
  try {
    const validatedData = addCommentSchema.parse(data);
    const authUser = await getCurrentUser();
    const role: Role =
      authUser?.role === "ADMIN" ? "admin" : authUser ? "user" : "guest";

    const workspaceId = await getCurrentWorkspaceId();
    const taskProject = await prisma.task.findFirst({
      where: { id: validatedData.taskId, isDeleted: false },
      select: {
        projectId: true,
        project: { select: { allowGuest: true, workspaceId: true } },
      },
    });
    if (taskProject?.project?.workspaceId !== workspaceId) {
      return { ok: false as const, formError: "Недоступно" };
    }

    if (
      !canComment({
        role,
        projectAllowGuest: taskProject?.project?.allowGuest,
      })
    ) {
      return { ok: false as const, formError: "Требуется авторизация" };
    }

    const createdComment = await prisma.comment.create({
      data: {
        taskId: validatedData.taskId,
        text: validatedData.text,
        userId: authUser?.id ?? null,
        authorName: authUser
          ? null
          : (validatedData.authorName?.trim() ?? "Гость"),
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

    if (taskProject?.projectId) {
      await broadcastTaskEvent(taskProject.projectId, taskProject.project.workspaceId, {
        type: "comment_added",
        payload: {
          projectId: taskProject.projectId,
          comment: {
            id: createdComment.id,
            taskId: createdComment.taskId,
            text: createdComment.text,
            userId: createdComment.userId,
            authorName: createdComment.authorName,
            createdAt: createdComment.createdAt.toISOString(),
          },
        },
      });
    }

    const task = await prisma.task.findUnique({
      where: { id: validatedData.taskId },
      select: { key: true },
    });

    revalidatePath(`/tasks/${task?.key ?? validatedData.taskId}`);
    revalidatePath("/board");
    revalidatePath("/backlog");
    revalidatePath("/issues");

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false as const, formError: "Не удалось добавить комментарий." };
  }
}

export async function deleteTaskAction(taskId: string) {
  try {
    const validated = taskDeleteSchema.parse({ taskId });
    const [authUser, workspaceId] = await Promise.all([
      getCurrentUser(),
      getCurrentWorkspaceId(),
    ]);

    const permission = await canManageTaskDeletion({
      taskId: validated.taskId,
      currentUserId: authUser?.id ?? null,
      workspaceId,
      currentUserRole: authUser?.role ?? null,
    });

    if (!permission.ok) return permission;
    if (permission.task.isDeleted) return { ok: true as const };

    await prisma.task.update({
      where: { id: permission.task.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
      select: { id: true },
    });

    await broadcastTaskEvent(permission.task.projectId, workspaceId, {
      type: "task_deleted",
      payload: {
        taskId: permission.task.id,
        projectId: permission.task.projectId,
      },
    });

    revalidatePath("/board");
    revalidatePath("/backlog");
    revalidatePath("/issues");
    revalidatePath("/trash");
    revalidatePath(`/tasks/${permission.task.key ?? permission.task.id}`);

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false as const, formError: "Не удалось удалить задачу." };
  }
}

export async function restoreTaskAction(taskId: string) {
  try {
    const validated = taskDeleteSchema.parse({ taskId });
    const [authUser, workspaceId] = await Promise.all([
      getCurrentUser(),
      getCurrentWorkspaceId(),
    ]);

    const permission = await canManageTaskDeletion({
      taskId: validated.taskId,
      currentUserId: authUser?.id ?? null,
      workspaceId,
      currentUserRole: authUser?.role ?? null,
    });

    if (!permission.ok) return permission;
    if (!permission.task.isDeleted) return { ok: true as const };

    const restored = await prisma.task.update({
      where: { id: permission.task.id },
      data: {
        isDeleted: false,
        deletedAt: null,
      },
      select: {
        id: true,
        projectId: true,
        key: true,
        title: true,
        description: true,
        type: true,
        priority: true,
        status: true,
        assigneeId: true,
        requesterName: true,
        createdAt: true,
      },
    });

    await broadcastTaskEvent(restored.projectId, workspaceId, {
      type: "task_restored",
      payload: {
        taskId: restored.id,
        projectId: restored.projectId,
        task: {
          id: restored.id,
          projectId: restored.projectId,
          key: restored.key,
          title: restored.title,
          description: restored.description,
          type: restored.type,
          priority: restored.priority,
          status: restored.status,
          assigneeId: restored.assigneeId,
          requesterName: restored.requesterName,
          createdAt: restored.createdAt.toISOString(),
        },
      },
    });

    revalidatePath("/board");
    revalidatePath("/backlog");
    revalidatePath("/issues");
    revalidatePath("/trash");
    revalidatePath(`/tasks/${restored.key ?? restored.id}`);

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false as const, formError: "Не удалось восстановить задачу." };
  }
}
