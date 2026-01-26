"use server";

import { z } from "zod";
import prisma from "../../lib/prisma";
import { taskSchema, type TaskInput } from "../validators/task";

export async function createTaskAction(data: TaskInput) {
  try {
    const validatedData = taskSchema.parse(data);
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

    const task = await prisma.task.create({
      data: {
        title: validatedData.title,
        description: details || validatedData.description,
        priority: validatedData.priority,
        tags: validatedData.tags ? validatedData.tags.split(",") : [],
        attachments: validatedData.attachments ?? [],
      },
    });

    return { ok: true, id: task.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false, formError: "Произошла ошибка при создании задачи." };
  }
}
