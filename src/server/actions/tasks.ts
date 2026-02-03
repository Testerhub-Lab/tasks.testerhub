// src/server/actions/tasks.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import prisma from "../../lib/prisma";
import { Status } from "@prisma/client";
import { getCurrentUser } from "../auth/session";
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
  })
  .refine(
    (data) =>
      data.status ||
      data.priority ||
      typeof data.title !== "undefined" ||
      typeof data.description !== "undefined",
    {
      message: "At least one field must be provided.",
    }
  );

const addCommentSchema = z.object({
  taskId: z.string().cuid(),
  text: z.string().min(1).max(2000),
  authorName: z.string().max(120).optional(),
});

function buildDescription(base: string | null | undefined, extra: string[]) {
  const cleanBase = (base ?? "").trim();
  const cleanExtra = extra.map((x) => x.trim()).filter(Boolean);

  if (!cleanBase && cleanExtra.length === 0) return null;
  if (!cleanBase) return cleanExtra.join("\n\n");
  if (cleanExtra.length === 0) return cleanBase;
  return `${cleanBase}\n\n${cleanExtra.join("\n\n")}`;
}

export async function createTaskAction(data: TaskInput) {
  try {
    const validated = taskSchema.parse(data);
    const authUser = await getCurrentUser();
    const role: Role =
      authUser?.role === "ADMIN" ? "admin" : authUser ? "user" : "guest";

    const project = await prisma.project.findUnique({
      where: { id: validated.projectId },
      select: { id: true, key: true, nextIssueNumber: true, allowGuest: true },
    });

    if (!project) {
      return { ok: false as const, formError: "Project not found" };
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
          assigneeId: validated.assigneeId ?? null,

          requesterName: effectiveRequesterName,
          requesterEmail: validated.requesterEmail?.trim() ?? null,

          projectId: updatedProject.id,
          number: nextNumber,
          key: taskKey,
        },
        select: { id: true },
      });

      return { id: created.id, key: taskKey };
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

    const taskProject = await prisma.task.findUnique({
      where: { id: validatedData.id },
      select: { project: { select: { allowGuest: true } } },
    });

    if (
      !canChangeStatus({
        role,
        projectAllowGuest: taskProject?.project?.allowGuest,
      })
    ) {
      return { ok: false as const, formError: "Требуется авторизация" };
    }

    await prisma.task.update({
      where: { id: validatedData.id },
      data: { status: validatedData.status },
      select: { id: true, key: true },
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
}) {
  try {
    const validatedData = updateFieldsSchema.parse(data);
    const authUser = await getCurrentUser();
    const role: Role =
      authUser?.role === "ADMIN" ? "admin" : authUser ? "user" : "guest";

    const taskProject = await prisma.task.findUnique({
      where: { id: validatedData.id },
      select: { project: { select: { allowGuest: true } } },
    });

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
        typeof validatedData.description !== "undefined") &&
        !canChangeStatus({
          role,
          projectAllowGuest: taskProject?.project?.allowGuest,
        }))
    ) {
      return { ok: false as const, formError: "Требуется авторизация" };
    }

    const updated = await prisma.task.update({
      where: { id: validatedData.id },
      data: {
        status: validatedData.status,
        priority: validatedData.priority,
        title: validatedData.title,
        description: validatedData.description,
      },
      select: { key: true },
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

    const taskProject = await prisma.task.findUnique({
      where: { id: validatedData.taskId },
      select: { project: { select: { allowGuest: true } } },
    });

    if (
      !canComment({
        role,
        projectAllowGuest: taskProject?.project?.allowGuest,
      })
    ) {
      return { ok: false as const, formError: "Требуется авторизация" };
    }

    await prisma.comment.create({
      data: {
        taskId: validatedData.taskId,
        text: validatedData.text,
        userId: authUser?.id ?? null,
        authorName: authUser
          ? null
          : (validatedData.authorName?.trim() ?? "Гость"),
      },
      select: { id: true },
    });

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
