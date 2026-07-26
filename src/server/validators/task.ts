import { z } from "zod";
import { Priority, Status } from "@prisma/client";

const statusValues = Object.values(Status) as [Status, ...Status[]];
const priorityValues = Object.values(Priority) as [Priority, ...Priority[]];

export const taskStatusSchema = z.enum(statusValues);
export const taskPrioritySchema = z.enum(priorityValues);

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

const tagsInputSchema = z
  .union([z.array(z.string().min(1)), z.string(), z.undefined(), z.null()])
  .transform((v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v.map((t) => t.trim()).filter(Boolean);
    return v
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  });

export const taskSchema = z
  .object({
    projectId: z.string().min(1, "projectId обязателен"),

    title: z.string().min(3, "Минимум 3 символа").max(120),
    description: z.string().max(2000).optional().nullable(),

    type: z.string().min(1).default("TASK"),

    priority: taskPrioritySchema.default(Priority.MEDIUM),
    status: taskStatusSchema.optional().default(Status.NEW),

    steps: z.string().max(2000).optional().nullable(),
    expected: z.string().max(2000).optional().nullable(),
    actual: z.string().max(2000).optional().nullable(),
    environment: z.string().max(2000).optional().nullable(),

    tags: tagsInputSchema.default([]),
    attachments: z
      .array(z.string().regex(/^\/api\/uploads\/[a-zA-Z0-9._-]+$/))
      .max(10)
      .default([]),

    dueDate: z.coerce.date().optional().nullable(),

    reporterId: z.string().optional().nullable(),
    assigneeId: z.string().optional().nullable(),

    requesterName: z.string().max(120).optional().nullable(),
    requesterEmail: z.string().email().optional().nullable(),
  })
  .transform((v) => ({
    ...v,
    type: (v.type ?? "TASK").trim().toUpperCase(),
  }));

export type TaskInput = z.input<typeof taskSchema>;
export type TaskData = z.infer<typeof taskSchema>;
