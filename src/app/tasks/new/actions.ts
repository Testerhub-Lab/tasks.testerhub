"use server";

import { z } from "zod";
import prisma from "../../../lib/prisma";
import { getCurrentUser } from "@/server/auth/session";

const taskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  dueDate: z.string().optional(),
  tags: z.string().optional(),
  requesterName: z.string().optional(),
  requesterEmail: z.string().email().optional(),
});

export async function createNewTask(data: {
  projectId: string;
  title: string;
  description?: string;
  priority: string;
  dueDate?: string;
  tags?: string[];
  requesterName?: string;
  requesterEmail?: string;
}) {
  const validatedData = taskSchema.parse(data);
  const authUser = await getCurrentUser();

  const task = await prisma.$transaction(async (tx) => {
    const project = await tx.project.update({
      where: { id: validatedData.projectId },
      data: { nextIssueNumber: { increment: 1 } },
      select: { id: true, key: true, nextIssueNumber: true },
    });
    const nextNumber = project.nextIssueNumber - 1;
    const taskKey = `${project.key}-${nextNumber}`;
    return tx.task.create({
      data: {
        title: validatedData.title,
        description: validatedData.description,
        priority: validatedData.priority,
        dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
        tags: validatedData.tags ? validatedData.tags.split(",") : [],
        requesterName: validatedData.requesterName,
        requesterEmail: validatedData.requesterEmail,
        creatorId: authUser?.id ?? null,
        projectId: project.id,
        number: nextNumber,
        key: taskKey,
      },
    });
  });

  return task;
}
