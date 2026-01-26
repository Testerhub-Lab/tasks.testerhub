import { z } from "zod";
export const TaskTypeEnum = z.enum(["Bug", "Task"]);
export const PriorityEnum = z.enum(["Low", "Medium", "High", "Critical"]);

export const taskSchema = z.object({
  type: z.enum(["Bug", "Task"]),
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional(),
  steps: z.string().max(2000).optional(),
  expected: z.string().max(2000).optional(),
  actual: z.string().max(2000).optional(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  tags: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  environment: z.string().optional(),
});

export type TaskInput = z.infer<typeof taskSchema>;
export type TaskType = z.infer<typeof TaskTypeEnum>;
export type Priority = z.infer<typeof PriorityEnum>;
