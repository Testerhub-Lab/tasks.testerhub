import { z } from "zod";

export const issueStatusSchema = z.enum([
  "NEW",
  "TODO",
  "HOLD",
  "IN_PROGRESS",
  "TESTING",
  "DONE",
  "REJECT",
]);

export const issuePrioritySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const createIssueApiSchema = z.object({
  projectKey: z.string().trim().min(2).max(6).transform((value) => value.toUpperCase()),
  title: z.string().trim().min(3).max(120),
  description: z.string().max(2000).optional().nullable(),
  type: z.string().trim().min(1).max(40).default("TASK"),
  priority: issuePrioritySchema.default("MEDIUM"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export const updateIssueApiSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: issueStatusSchema.optional(),
    priority: issuePrioritySchema.optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .refine(
    (value) =>
      typeof value.title !== "undefined" ||
      typeof value.description !== "undefined" ||
      typeof value.status !== "undefined" ||
      typeof value.priority !== "undefined" ||
      typeof value.tags !== "undefined",
    "Нужно передать хотя бы одно изменяемое поле"
  );

export const addCommentApiSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const createWikiPageApiSchema = z.object({
  title: z.string().trim().min(1).max(160),
  contentMarkdown: z.string().max(200_000).default(""),
  parentId: z.string().min(1).optional().nullable(),
});

export const updateWikiPageApiSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    contentMarkdown: z.string().max(200_000).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine(
    (value) =>
      typeof value.title !== "undefined" ||
      typeof value.contentMarkdown !== "undefined",
    "Нужно передать заголовок или содержимое"
  );

export const linkWikiPageApiSchema = z.object({
  pageId: z.string().min(1),
});
