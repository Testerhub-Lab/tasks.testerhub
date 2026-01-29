import { z } from "zod";
import { Priority, Status } from "@prisma/client";

// Тип задачи — доменный, не Prisma enum
export const TaskTypeEnum = z.enum(["Bug", "Task"]);
export type TaskType = z.infer<typeof TaskTypeEnum>;

// --- helpers: enum from Prisma values (без z.nativeEnum)
const statusValues = Object.values(Status) as [Status, ...Status[]];
const priorityValues = Object.values(Priority) as [Priority, ...Priority[]];

export const taskStatusSchema = z.enum(statusValues);
export const taskPrioritySchema = z.enum(priorityValues);

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

// совместимость со старым именем (если где-то использовал)
export const PriorityEnum = taskPrioritySchema;

export const taskSchema = z.object({
  projectId: z.string().min(1),
  type: TaskTypeEnum,
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional(),
  steps: z.string().max(2000).optional(),
  expected: z.string().max(2000).optional(),
  actual: z.string().max(2000).optional(),
  priority: taskPrioritySchema, // LOW/MEDIUM/HIGH/CRITICAL
  tags: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  environment: z.string().optional(),
});

export type TaskInput = z.infer<typeof taskSchema>;
