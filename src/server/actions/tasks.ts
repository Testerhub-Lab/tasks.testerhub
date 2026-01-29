"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import prisma from "../../lib/prisma";
import {
  taskSchema,
  taskStatusSchema,
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
    priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  })
  .refine((data) => data.status || data.priority, {
    message: "At least one field must be provided.",
  });

const addCommentSchema = z.object({
  taskId: z.string().cuid(),
  text: z.string().min(1).max(2000),
  authorName: z.string().max(120).optional(),
});

export async function createTaskAction(data: TaskInput) {
  try {
    const validatedData = taskSchema.parse(data);
    const project = await prisma.project.findUnique({
      where: { id: validatedData.projectId },
      select: { id: true, key: true, nextIssueNumber: true },
    });
    if (!project) {
      return { ok: false, formError: "Project not found" };
    }
    const details = [
      `Тип: ${validatedData.type}`,
      validatedData.description ? `Описание: ${validatedData.description}` : null,
      validatedData.steps ? `Шаги: ${validatedData.steps}` : null,
      validatedData.expected ? `Ожидаемое: ${validatedData.expected}` : null,
      validatedData.actual ? `Фактическое: ${validatedData.actual}` : null,
      validatedData.environment ? `Окружение: ${validatedData.environment}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const task = await prisma.$transaction(async (tx) => {
      const updatedProject = await tx.project.update({
        where: { id: project.id },
        data: { nextIssueNumber: { increment: 1 } },
        select: { id: true, key: true, nextIssueNumber: true },
      });
      const nextNumber = updatedProject.nextIssueNumber - 1;
      const taskKey = `${updatedProject.key}-${nextNumber}`;
      const created = await tx.task.create({
        data: {
          title: validatedData.title,
          description: details || validatedData.description,
          priority: validatedData.priority,
          status: "New",
          tags: validatedData.tags ? validatedData.tags.split(",") : [],
          attachments: validatedData.attachments ?? [],
          projectId: updatedProject.id,
          number: nextNumber,
          key: taskKey,
        },
      });
      return { task: created, taskKey };
    });

    return { ok: true, id: task.task.id, key: task.taskKey };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false, formError: "Произошла ошибка при создании задачи." };
  }
}

export async function updateTaskStatusAction(data: {
  id: string;
  status: z.infer<typeof taskStatusSchema>;
}) {
  try {
    const validatedData = updateStatusSchema.parse(data);
    await prisma.task.update({
      where: { id: validatedData.id },
      data: { status: validatedData.status },
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false, formError: "Не удалось обновить статус." };
  }
}

export async function updateTaskFieldsAction(data: {
  id: string;
  status?: z.infer<typeof taskStatusSchema>;
  priority?: TaskPriority;
}) {
  try {
    const validatedData = updateFieldsSchema.parse(data);
    const updated = await prisma.task.update({
      where: { id: validatedData.id },
      data: {
        status: validatedData.status,
        priority: validatedData.priority,
      },
      select: { key: true },
    });
    revalidatePath(`/tasks/${updated.key ?? validatedData.id}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false, formError: "Не удалось обновить задачу." };
  }
}

export async function addCommentAction(data: {
  taskId: string;
  text: string;
  authorName?: string;
}) {
  try {
    const validatedData = addCommentSchema.parse(data);
    await prisma.comment.create({
      data: {
        taskId: validatedData.taskId,
        text: validatedData.text,
        authorName: validatedData.authorName,
      },
    });
    const task = await prisma.task.findUnique({
      where: { id: validatedData.taskId },
      select: { key: true },
    });
    revalidatePath(`/tasks/${task?.key ?? validatedData.taskId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false, formError: "Не удалось добавить комментарий." };
  }
}
