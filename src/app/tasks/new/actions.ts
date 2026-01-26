"use server";

import { z } from "zod";
import prisma from "../../../lib/prisma";

const taskSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional(),
  priority: z.enum(["Low", "Medium", "High"]),
  dueDate: z.string().optional(),
  tags: z.string().optional(),
  requesterName: z.string().optional(),
  requesterEmail: z.string().email().optional(),
});

export async function createNewTask(data: {
  title: string;
  description?: string;
  priority: string;
  dueDate?: string;
  tags?: string[];
  requesterName?: string;
  requesterEmail?: string;
}) {
  const validatedData = taskSchema.parse(data);

  const task = await prisma.task.create({
    data: {
      title: validatedData.title,
      description: validatedData.description,
      priority: validatedData.priority,
      dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
      tags: validatedData.tags ? validatedData.tags.split(",") : [],
      requesterName: validatedData.requesterName,
      requesterEmail: validatedData.requesterEmail,
    },
  });

  return task;
}