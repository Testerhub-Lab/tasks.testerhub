"use server";

import { revalidatePath } from "next/cache";
import {
  KnowledgeProvider,
  ProjectRole,
  WikiReviewDecisionType,
  WikiWorkflowStatus,
} from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth/session";
import { hasProjectRole } from "@/server/auth/access";
import { createWikiSlug } from "./slug";
import { usesZeroUiStore } from "@/server/ui/zero-legacy";
import {
  addZeroTaskKnowledgeLink,
  addZeroWikiCommentReply,
  createZeroWikiCommentThread,
  createZeroWikiPageForUI,
  removeZeroTaskKnowledgeLink,
  restoreZeroWikiRevision,
  resolveZeroWikiCommentThread,
  setZeroWikiPageArchived,
  updateZeroWikiWorkflow,
  updateZeroProjectKnowledge,
  updateZeroWikiPageForUI,
} from "@/server/ui/zero-wiki-actions";

const providerSchema = z
  .object({
    projectId: z.string().min(1),
    provider: z.enum(["DISABLED", "NATIVE", "EXTERNAL"]),
    externalUrl: z.string().trim().url().max(2000).optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.provider === "EXTERNAL" && !value.externalUrl) {
      context.addIssue({
        code: "custom",
        path: ["externalUrl"],
        message: "Для внешней Wiki нужна ссылка",
      });
    }
    if (
      value.externalUrl &&
      !value.externalUrl.startsWith("https://") &&
      !value.externalUrl.startsWith("http://")
    ) {
      context.addIssue({
        code: "custom",
        path: ["externalUrl"],
        message: "Поддерживаются только HTTP(S)-ссылки",
      });
    }
  });

const createPageSchema = z.object({
  projectId: z.string().min(1),
  parentId: z.string().min(1).optional().nullable(),
  title: z.string().trim().min(1).max(160),
});

const updatePageSchema = z.object({
  pageId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  contentMarkdown: z.string().max(200_000),
  parentId: z.string().min(1).optional().nullable(),
  expectedVersion: z.number().int().positive(),
});

const pageStateSchema = z.object({
  pageId: z.string().min(1),
  archived: z.boolean(),
});

const restoreRevisionSchema = z.object({
  pageId: z.string().min(1),
  revisionId: z.string().min(1),
});

const linkSchema = z.object({
  taskId: z.string().min(1),
  pageId: z.string().min(1),
});

const removeLinkSchema = z.object({
  linkId: z.string().min(1),
});

const workflowSchema = z
  .object({
    pageId: z.string().min(1),
    action: z.enum(["SUBMIT", "ASSIGN_REVIEWER", "APPROVE", "REQUEST_CHANGES"]),
    assigneeId: z.string().min(1).optional().nullable(),
    comment: z.string().trim().max(20_000).optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.action === "REQUEST_CHANGES" && !value.comment) {
      context.addIssue({
        code: "custom",
        path: ["comment"],
        message: "Укажите, что нужно изменить",
      });
    }
    if (
      (value.action === "SUBMIT" || value.action === "ASSIGN_REVIEWER") &&
      !value.assigneeId
    ) {
      context.addIssue({
        code: "custom",
        path: ["assigneeId"],
        message: "Выберите согласующего",
      });
    }
  });

const createWikiCommentSchema = z.object({
  pageId: z.string().min(1),
  body: z.string().trim().min(1).max(20_000),
  anchorQuote: z.string().trim().min(1).max(2_000).optional().nullable(),
});

const replyWikiCommentSchema = z.object({
  threadId: z.string().min(1),
  body: z.string().trim().min(1).max(20_000),
});

const resolveWikiCommentSchema = z.object({
  threadId: z.string().min(1),
  resolved: z.boolean(),
});

async function requireProjectRole(projectId: string, role: ProjectRole) {
  const user = await getCurrentUser();
  if (!user) return null;

  const access = await hasProjectRole(user, projectId, role, {
    includeArchived: true,
  });
  return access ? { user, access } : null;
}

async function requireNativeWiki(projectId: string) {
  const configuration = await prisma.projectKnowledge.findUnique({
    where: { projectId },
    select: { provider: true },
  });
  return configuration?.provider === KnowledgeProvider.NATIVE;
}

async function getUniqueSlug(projectId: string, title: string) {
  const base = createWikiSlug(title);
  const matches = await prisma.wikiPage.findMany({
    where: {
      projectId,
      OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }],
    },
    select: { slug: true },
  });
  const existing = new Set(matches.map((page) => page.slug));
  if (!existing.has(base)) return base;

  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function revalidateWiki(projectKey: string, pageId?: string) {
  revalidatePath("/wiki");
  revalidatePath(`/wiki/${projectKey}`);
  if (pageId) revalidatePath(`/wiki/${projectKey}/${pageId}`);
  revalidatePath("/settings/workspace");
}

export async function updateProjectKnowledgeAction(input: {
  projectId: string;
  provider: "DISABLED" | "NATIVE" | "EXTERNAL";
  externalUrl?: string | null;
}) {
  const parsed = providerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, formError: parsed.error.issues[0]?.message };
  }

  const context = await requireProjectRole(
    parsed.data.projectId,
    ProjectRole.ADMIN
  );
  if (!context) {
    return { ok: false as const, formError: "Недостаточно прав" };
  }

  if (usesZeroUiStore()) {
    try {
      const project = await updateZeroProjectKnowledge({
        userID: context.user.id,
        projectID: parsed.data.projectId,
        provider: parsed.data.provider,
        externalURL: parsed.data.externalUrl ?? null,
      });
      revalidateWiki(project.key);
      return { ok: true as const };
    } catch {
      return { ok: false as const, formError: "Не удалось обновить Wiki" };
    }
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true, key: true },
  });
  if (!project) return { ok: false as const, formError: "Проект не найден" };

  await prisma.projectKnowledge.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      provider: parsed.data.provider,
      externalUrl:
        parsed.data.provider === "EXTERNAL" ? parsed.data.externalUrl : null,
    },
    update: {
      provider: parsed.data.provider,
      externalUrl:
        parsed.data.provider === "EXTERNAL" ? parsed.data.externalUrl : null,
    },
  });

  revalidateWiki(project.key);
  return { ok: true as const };
}

export async function createWikiPageAction(input: {
  projectId: string;
  parentId?: string | null;
  title: string;
}) {
  const parsed = createPageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, formError: "Проверьте название страницы" };
  }

  const context = await requireProjectRole(
    parsed.data.projectId,
    ProjectRole.MEMBER
  );
  if (!context) {
    return { ok: false as const, formError: "Wiki недоступна для редактирования" };
  }

  if (usesZeroUiStore()) {
    try {
      const created = await createZeroWikiPageForUI({
        user: context.user,
        projectID: parsed.data.projectId,
        parentID: parsed.data.parentId ?? null,
        title: parsed.data.title,
      });
      revalidateWiki(created.project.key, created.id);
      return {
        ok: true as const,
        pageId: created.id,
        projectKey: created.project.key,
      };
    } catch {
      return {
        ok: false as const,
        formError: "Wiki недоступна для редактирования",
      };
    }
  }

  if (!(await requireNativeWiki(parsed.data.projectId))) {
    return { ok: false as const, formError: "Wiki недоступна для редактирования" };
  }

  if (parsed.data.parentId) {
    const parent = await prisma.wikiPage.findFirst({
      where: {
        id: parsed.data.parentId,
        projectId: parsed.data.projectId,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!parent) {
      return { ok: false as const, formError: "Родительская страница не найдена" };
    }
  }

  const [project, lastPage, slug] = await Promise.all([
    prisma.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { key: true },
    }),
    prisma.wikiPage.findFirst({
      where: {
        projectId: parsed.data.projectId,
        parentId: parsed.data.parentId ?? null,
      },
      select: { sortOrder: true },
      orderBy: { sortOrder: "desc" },
    }),
    getUniqueSlug(parsed.data.projectId, parsed.data.title),
  ]);
  if (!project) return { ok: false as const, formError: "Проект не найден" };

  const created = await prisma.wikiPage.create({
    data: {
      projectId: parsed.data.projectId,
      parentId: parsed.data.parentId ?? null,
      title: parsed.data.title,
      slug,
      sortOrder: (lastPage?.sortOrder ?? -1) + 1,
      createdById: context.user.id,
      updatedById: context.user.id,
      revisions: {
        create: {
          version: 1,
          title: parsed.data.title,
          contentMarkdown: "",
          createdById: context.user.id,
        },
      },
    },
    select: { id: true },
  });

  revalidateWiki(project.key, created.id);
  return { ok: true as const, pageId: created.id, projectKey: project.key };
}

export async function updateWikiPageAction(input: {
  pageId: string;
  title: string;
  contentMarkdown: string;
  parentId?: string | null;
  expectedVersion: number;
}) {
  const parsed = updatePageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, formError: "Проверьте содержимое страницы" };
  }

  if (usesZeroUiStore()) {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false as const, formError: "Требуется авторизация" };
    }
    try {
      const updated = await updateZeroWikiPageForUI({
        user,
        pageID: parsed.data.pageId,
        title: parsed.data.title,
        contentMarkdown: parsed.data.contentMarkdown,
        parentID: parsed.data.parentId ?? null,
        expectedVersion: parsed.data.expectedVersion,
      });
      revalidateWiki(updated.project.key, updated.id);
      return { ok: true as const, version: updated.version };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Wiki version conflict:")
      ) {
        return {
          ok: false as const,
          formError:
            "Страница изменилась после открытия редактора. Обновите страницу и повторите изменения.",
          conflict: true as const,
        };
      }
      return { ok: false as const, formError: "Не удалось сохранить страницу" };
    }
  }

  const page = await prisma.wikiPage.findUnique({
    where: { id: parsed.data.pageId },
    select: {
      id: true,
      projectId: true,
      parentId: true,
      version: true,
      archivedAt: true,
      project: { select: { key: true } },
    },
  });
  if (!page || page.archivedAt) {
    return { ok: false as const, formError: "Страница не найдена" };
  }

  const context = await requireProjectRole(page.projectId, ProjectRole.MEMBER);
  if (!context || !(await requireNativeWiki(page.projectId))) {
    return { ok: false as const, formError: "Wiki недоступна для редактирования" };
  }

  if (parsed.data.parentId) {
    const pages = await prisma.wikiPage.findMany({
      where: { projectId: page.projectId, archivedAt: null },
      select: { id: true, parentId: true },
    });
    const byId = new Map(pages.map((candidate) => [candidate.id, candidate]));
    let candidate = byId.get(parsed.data.parentId);
    const visited = new Set<string>();
    while (candidate && !visited.has(candidate.id)) {
      if (candidate.id === page.id) {
        return {
          ok: false as const,
          formError: "Страница не может быть вложена в собственную ветку",
        };
      }
      visited.add(candidate.id);
      candidate = candidate.parentId ? byId.get(candidate.parentId) : undefined;
    }
    if (!byId.has(parsed.data.parentId)) {
      return { ok: false as const, formError: "Родительская страница не найдена" };
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.wikiPage.updateMany({
        where: { id: page.id, version: parsed.data.expectedVersion },
        data: {
          title: parsed.data.title,
          contentMarkdown: parsed.data.contentMarkdown,
          parentId: parsed.data.parentId ?? null,
          workflowStatus: WikiWorkflowStatus.DRAFT,
          reviewVersion: null,
          reviewRequestedById: null,
          reviewAssigneeId: null,
          reviewRequestedAt: null,
          updatedById: context.user.id,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error("Wiki version conflict");
      const nextVersion = parsed.data.expectedVersion + 1;
      await tx.wikiPageRevision.create({
        data: {
          pageId: page.id,
          version: nextVersion,
          title: parsed.data.title,
          contentMarkdown: parsed.data.contentMarkdown,
          createdById: context.user.id,
        },
      });
      await tx.knowledgeLink.updateMany({
        where: {
          projectId: page.projectId,
          provider: KnowledgeProvider.NATIVE,
          documentKey: page.id,
        },
        data: { title: parsed.data.title },
      });
      return { version: nextVersion };
    });

    revalidateWiki(page.project.key, page.id);
    return { ok: true as const, version: updated.version };
  } catch (error) {
    if (error instanceof Error && error.message === "Wiki version conflict") {
      return {
        ok: false as const,
        formError:
          "Страница изменилась после открытия редактора. Обновите страницу и повторите изменения.",
        conflict: true as const,
      };
    }
    return { ok: false as const, formError: "Не удалось сохранить страницу" };
  }
}

export async function setWikiPageArchivedAction(input: {
  pageId: string;
  archived: boolean;
}) {
  const parsed = pageStateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, formError: "Неверные данные" };

  if (usesZeroUiStore()) {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false as const, formError: "Требуется авторизация" };
    }
    try {
      const page = await setZeroWikiPageArchived({
        userID: user.id,
        pageID: parsed.data.pageId,
        archived: parsed.data.archived,
      });
      revalidateWiki(page.projectKey, parsed.data.pageId);
      return { ok: true as const };
    } catch {
      return { ok: false as const, formError: "Не удалось обновить страницу" };
    }
  }

  const page = await prisma.wikiPage.findUnique({
    where: { id: parsed.data.pageId },
    select: {
      id: true,
      parentId: true,
      projectId: true,
      project: { select: { key: true } },
    },
  });
  if (!page) return { ok: false as const, formError: "Страница не найдена" };

  const context = await requireProjectRole(page.projectId, ProjectRole.MEMBER);
  if (!context || !(await requireNativeWiki(page.projectId))) {
    return { ok: false as const, formError: "Недостаточно прав" };
  }

  const pages = await prisma.wikiPage.findMany({
    where: { projectId: page.projectId },
    select: { id: true, parentId: true },
  });
  const affected = new Set([page.id]);
  let foundMore = true;
  while (foundMore) {
    foundMore = false;
    for (const candidate of pages) {
      if (
        candidate.parentId &&
        affected.has(candidate.parentId) &&
        !affected.has(candidate.id)
      ) {
        affected.add(candidate.id);
        foundMore = true;
      }
    }
  }

  await prisma.wikiPage.updateMany({
    where: { id: { in: [...affected] } },
    data: { archivedAt: parsed.data.archived ? new Date() : null },
  });

  revalidateWiki(page.project.key, page.id);
  return { ok: true as const };
}

export async function restoreWikiRevisionAction(input: {
  pageId: string;
  revisionId: string;
}) {
  const parsed = restoreRevisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, formError: "Неверные данные" };

  if (usesZeroUiStore()) {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false as const, formError: "Требуется авторизация" };
    }
    try {
      const restored = await restoreZeroWikiRevision({
        user,
        pageID: parsed.data.pageId,
        revisionID: parsed.data.revisionId,
      });
      revalidateWiki(restored.projectKey, parsed.data.pageId);
      return { ok: true as const, version: restored.version };
    } catch {
      return { ok: false as const, formError: "Не удалось восстановить версию" };
    }
  }

  const revision = await prisma.wikiPageRevision.findFirst({
    where: { id: parsed.data.revisionId, pageId: parsed.data.pageId },
    select: {
      title: true,
      contentMarkdown: true,
      page: {
        select: {
          id: true,
          projectId: true,
          archivedAt: true,
          project: { select: { key: true } },
        },
      },
    },
  });
  if (!revision || revision.page.archivedAt) {
    return { ok: false as const, formError: "Версия не найдена" };
  }

  const context = await requireProjectRole(
    revision.page.projectId,
    ProjectRole.MEMBER
  );
  if (!context || !(await requireNativeWiki(revision.page.projectId))) {
    return { ok: false as const, formError: "Недостаточно прав" };
  }

  const restored = await prisma.$transaction(async (tx) => {
    const page = await tx.wikiPage.update({
      where: { id: revision.page.id },
      data: {
        title: revision.title,
        contentMarkdown: revision.contentMarkdown,
        workflowStatus: WikiWorkflowStatus.DRAFT,
        reviewVersion: null,
        reviewRequestedById: null,
        reviewAssigneeId: null,
        reviewRequestedAt: null,
        updatedById: context.user.id,
        version: { increment: 1 },
      },
      select: { version: true },
    });
    await tx.wikiPageRevision.create({
      data: {
        pageId: revision.page.id,
        version: page.version,
        title: revision.title,
        contentMarkdown: revision.contentMarkdown,
        createdById: context.user.id,
      },
    });
    await tx.knowledgeLink.updateMany({
      where: {
        projectId: revision.page.projectId,
        provider: KnowledgeProvider.NATIVE,
        documentKey: revision.page.id,
      },
      data: { title: revision.title },
    });
    return page;
  });

  revalidateWiki(revision.page.project.key, revision.page.id);
  return { ok: true as const, version: restored.version };
}

export async function updateWikiWorkflowAction(input: {
  pageId: string;
  action: "SUBMIT" | "ASSIGN_REVIEWER" | "APPROVE" | "REQUEST_CHANGES";
  assigneeId?: string | null;
  comment?: string | null;
}) {
  const parsed = workflowSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      formError: parsed.error.issues[0]?.message ?? "Неверные данные",
    };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, formError: "Требуется авторизация" };

  if (usesZeroUiStore()) {
    try {
      const updated = await updateZeroWikiWorkflow({
        userID: user.id,
        pageID: parsed.data.pageId,
        action: parsed.data.action,
        assigneeID: parsed.data.assigneeId ?? null,
        comment: parsed.data.comment ?? null,
      });
      revalidateWiki(updated.projectKey, parsed.data.pageId);
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "Wiki page is already in review") {
        return { ok: false as const, formError: "Страница уже на проверке" };
      }
      if (message === "Wiki review is stale") {
        return {
          ok: false as const,
          formError: "После запроса проверки появилась новая версия страницы",
        };
      }
      return { ok: false as const, formError: "Не удалось изменить статус" };
    }
  }

  const page = await prisma.wikiPage.findUnique({
    where: { id: parsed.data.pageId },
    select: {
      id: true,
      projectId: true,
      version: true,
      workflowStatus: true,
      reviewVersion: true,
      reviewAssigneeId: true,
      archivedAt: true,
      project: { select: { key: true } },
    },
  });
  if (!page || page.archivedAt) {
    return { ok: false as const, formError: "Страница не найдена" };
  }
  const requiredRole =
    parsed.data.action === "SUBMIT" || parsed.data.action === "ASSIGN_REVIEWER"
      ? ProjectRole.MEMBER
      : ProjectRole.ADMIN;
  const context = await requireProjectRole(page.projectId, requiredRole);
  const isAssignedReviewer =
    parsed.data.action !== "SUBMIT" &&
    parsed.data.action !== "ASSIGN_REVIEWER" &&
    page.reviewAssigneeId === user.id;
  const reviewerContext = context ?? (
    isAssignedReviewer
      ? await requireProjectRole(page.projectId, ProjectRole.MEMBER)
      : null
  );
  if (!reviewerContext || !(await requireNativeWiki(page.projectId))) {
    return { ok: false as const, formError: "Недостаточно прав" };
  }

  if (parsed.data.action === "SUBMIT" || parsed.data.action === "ASSIGN_REVIEWER") {
    const assignee = await prisma.user.findFirst({
      where: {
        id: parsed.data.assigneeId ?? "",
        OR: [
          {
            workspaceMemberships: {
              some: { workspaceId: reviewerContext.access.workspaceId, role: "ADMIN" },
            },
          },
          {
            projectMemberships: {
              some: {
                projectId: page.projectId,
                role: "ADMIN",
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (!assignee) {
      return { ok: false as const, formError: "Согласующий не найден" };
    }

    if (parsed.data.action === "ASSIGN_REVIEWER") {
      await prisma.wikiPage.update({
        where: { id: page.id },
        data: { reviewAssigneeId: assignee.id },
      });
      revalidateWiki(page.project.key, page.id);
      return { ok: true as const };
    }

    if (page.workflowStatus === WikiWorkflowStatus.IN_REVIEW) {
      return { ok: false as const, formError: "Страница уже на проверке" };
    }
    const submitted = await prisma.wikiPage.updateMany({
      where: {
        id: page.id,
        version: page.version,
        workflowStatus: { not: WikiWorkflowStatus.IN_REVIEW },
      },
      data: {
        workflowStatus: WikiWorkflowStatus.IN_REVIEW,
        reviewVersion: page.version,
        reviewRequestedById: reviewerContext.user.id,
        reviewAssigneeId: assignee.id,
        reviewRequestedAt: new Date(),
      },
    });
    if (submitted.count !== 1) {
      return {
        ok: false as const,
        formError: "Страница изменилась — обновите её перед отправкой",
      };
    }
  } else {
    if (
      page.workflowStatus !== WikiWorkflowStatus.IN_REVIEW ||
      page.reviewVersion !== page.version
    ) {
      return {
        ok: false as const,
        formError: "После запроса проверки появилась новая версия страницы",
      };
    }
    const revision = await prisma.wikiPageRevision.findUnique({
      where: { pageId_version: { pageId: page.id, version: page.version } },
      select: { id: true },
    });
    if (!revision) return { ok: false as const, formError: "Версия не найдена" };
    const approved = parsed.data.action === "APPROVE";
    const transitioned = await prisma.$transaction(async (tx) => {
      const updated = await tx.wikiPage.updateMany({
        where: {
          id: page.id,
          version: page.version,
          workflowStatus: WikiWorkflowStatus.IN_REVIEW,
          reviewVersion: page.version,
          OR: [
            { reviewAssigneeId: null },
            { reviewAssigneeId: reviewerContext.user.id },
          ],
        },
        data: {
          ...(approved
            ? {
                workflowStatus: WikiWorkflowStatus.APPROVED,
                approvedVersion: page.version,
              }
            : {
                workflowStatus: WikiWorkflowStatus.DRAFT,
                reviewVersion: null,
                reviewRequestedById: null,
                reviewAssigneeId: null,
                reviewRequestedAt: null,
              }),
        },
      });
      if (updated.count !== 1) return false;
      await tx.wikiReviewDecision.create({
        data: {
          pageId: page.id,
          revisionId: revision.id,
          reviewerId: reviewerContext.user.id,
          decision: approved
            ? WikiReviewDecisionType.APPROVED
            : WikiReviewDecisionType.CHANGES_REQUESTED,
          comment: parsed.data.comment ?? null,
        },
      });
      return true;
    });
    if (!transitioned) {
      return {
        ok: false as const,
        formError: "Проверка уже завершена или страница изменилась",
      };
    }
  }

  revalidateWiki(page.project.key, page.id);
  return { ok: true as const };
}

export async function createWikiCommentThreadAction(input: {
  pageId: string;
  body: string;
  anchorQuote?: string | null;
}) {
  const parsed = createWikiCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, formError: "Проверьте текст комментария" };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, formError: "Требуется авторизация" };

  if (usesZeroUiStore()) {
    try {
      const created = await createZeroWikiCommentThread({
        userID: user.id,
        pageID: parsed.data.pageId,
        body: parsed.data.body,
        anchorQuote: parsed.data.anchorQuote ?? null,
      });
      revalidateWiki(created.projectKey, parsed.data.pageId);
      return { ok: true as const, threadId: created.threadID };
    } catch {
      return { ok: false as const, formError: "Не удалось добавить комментарий" };
    }
  }

  const page = await prisma.wikiPage.findUnique({
    where: { id: parsed.data.pageId },
    select: {
      id: true,
      projectId: true,
      version: true,
      archivedAt: true,
      project: { select: { key: true } },
    },
  });
  if (!page || page.archivedAt) {
    return { ok: false as const, formError: "Страница не найдена" };
  }
  const context = await requireProjectRole(page.projectId, ProjectRole.MEMBER);
  if (!context || !(await requireNativeWiki(page.projectId))) {
    return { ok: false as const, formError: "Недостаточно прав" };
  }
  const revision = await prisma.wikiPageRevision.findUnique({
    where: { pageId_version: { pageId: page.id, version: page.version } },
    select: { id: true },
  });
  if (!revision) return { ok: false as const, formError: "Версия не найдена" };
  const thread = await prisma.wikiCommentThread.create({
    data: {
      pageId: page.id,
      revisionId: revision.id,
      anchorQuote: parsed.data.anchorQuote ?? null,
      createdById: context.user.id,
      comments: {
        create: { authorId: context.user.id, body: parsed.data.body },
      },
    },
    select: { id: true },
  });
  revalidateWiki(page.project.key, page.id);
  return { ok: true as const, threadId: thread.id };
}

export async function addWikiCommentReplyAction(input: {
  threadId: string;
  body: string;
}) {
  const parsed = replyWikiCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, formError: "Проверьте текст ответа" };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, formError: "Требуется авторизация" };
  if (usesZeroUiStore()) {
    try {
      const updated = await addZeroWikiCommentReply({
        userID: user.id,
        threadID: parsed.data.threadId,
        body: parsed.data.body,
      });
      revalidateWiki(updated.projectKey, updated.pageID);
      return { ok: true as const };
    } catch {
      return { ok: false as const, formError: "Не удалось добавить ответ" };
    }
  }
  const thread = await prisma.wikiCommentThread.findUnique({
    where: { id: parsed.data.threadId },
    select: {
      pageId: true,
      page: { select: { projectId: true, project: { select: { key: true } } } },
    },
  });
  if (!thread) return { ok: false as const, formError: "Обсуждение не найдено" };
  const context = await requireProjectRole(
    thread.page.projectId,
    ProjectRole.MEMBER
  );
  if (!context || !(await requireNativeWiki(thread.page.projectId))) {
    return { ok: false as const, formError: "Недостаточно прав" };
  }
  await prisma.wikiComment.create({
    data: {
      threadId: parsed.data.threadId,
      authorId: context.user.id,
      body: parsed.data.body,
    },
  });
  revalidateWiki(thread.page.project.key, thread.pageId);
  return { ok: true as const };
}

export async function resolveWikiCommentThreadAction(input: {
  threadId: string;
  resolved: boolean;
}) {
  const parsed = resolveWikiCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, formError: "Неверные данные" };
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, formError: "Требуется авторизация" };
  if (usesZeroUiStore()) {
    try {
      const updated = await resolveZeroWikiCommentThread({
        userID: user.id,
        threadID: parsed.data.threadId,
        resolved: parsed.data.resolved,
      });
      revalidateWiki(updated.projectKey, updated.pageID);
      return { ok: true as const };
    } catch {
      return { ok: false as const, formError: "Не удалось обновить обсуждение" };
    }
  }
  const thread = await prisma.wikiCommentThread.findUnique({
    where: { id: parsed.data.threadId },
    select: {
      pageId: true,
      page: { select: { projectId: true, project: { select: { key: true } } } },
    },
  });
  if (!thread) return { ok: false as const, formError: "Обсуждение не найдено" };
  const context = await requireProjectRole(
    thread.page.projectId,
    ProjectRole.MEMBER
  );
  if (!context || !(await requireNativeWiki(thread.page.projectId))) {
    return { ok: false as const, formError: "Недостаточно прав" };
  }
  await prisma.wikiCommentThread.update({
    where: { id: parsed.data.threadId },
    data: parsed.data.resolved
      ? {
          status: "RESOLVED",
          resolvedById: context.user.id,
          resolvedAt: new Date(),
        }
      : { status: "OPEN", resolvedById: null, resolvedAt: null },
  });
  revalidateWiki(thread.page.project.key, thread.pageId);
  return { ok: true as const };
}

export async function addTaskKnowledgeLinkAction(input: {
  taskId: string;
  pageId: string;
}) {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, formError: "Неверные данные" };

  if (usesZeroUiStore()) {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false as const, formError: "Требуется авторизация" };
    }
    try {
      const link = await addZeroTaskKnowledgeLink({
        user,
        taskID: parsed.data.taskId,
        pageID: parsed.data.pageId,
      });
      revalidatePath(`/tasks/${link.issueKey}`);
      return { ok: true as const };
    } catch {
      return { ok: false as const, formError: "Документ недоступен" };
    }
  }

  const [task, page] = await Promise.all([
    prisma.task.findUnique({
      where: { id: parsed.data.taskId },
      select: { id: true, projectId: true, key: true },
    }),
    prisma.wikiPage.findUnique({
      where: { id: parsed.data.pageId },
      select: {
        id: true,
        projectId: true,
        title: true,
        archivedAt: true,
        project: { select: { key: true } },
      },
    }),
  ]);
  if (
    !task ||
    !page ||
    page.archivedAt ||
    task.projectId !== page.projectId
  ) {
    return { ok: false as const, formError: "Документ недоступен" };
  }

  const context = await requireProjectRole(task.projectId, ProjectRole.MEMBER);
  if (!context || !(await requireNativeWiki(task.projectId))) {
    return { ok: false as const, formError: "Недостаточно прав" };
  }

  await prisma.knowledgeLink.upsert({
    where: {
      taskId_provider_documentKey: {
        taskId: task.id,
        provider: KnowledgeProvider.NATIVE,
        documentKey: page.id,
      },
    },
    create: {
      taskId: task.id,
      projectId: task.projectId,
      provider: KnowledgeProvider.NATIVE,
      documentKey: page.id,
      title: page.title,
      createdById: context.user.id,
    },
    update: { title: page.title },
  });

  revalidatePath(`/tasks/${task.key}`);
  return { ok: true as const };
}

export async function removeTaskKnowledgeLinkAction(input: { linkId: string }) {
  const parsed = removeLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, formError: "Неверные данные" };

  if (usesZeroUiStore()) {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false as const, formError: "Требуется авторизация" };
    }
    try {
      const removed = await removeZeroTaskKnowledgeLink({
        userID: user.id,
        linkID: parsed.data.linkId,
      });
      if (removed) revalidatePath(`/tasks/${removed.issueKey}`);
      return { ok: true as const };
    } catch {
      return { ok: false as const, formError: "Недостаточно прав" };
    }
  }

  const link = await prisma.knowledgeLink.findUnique({
    where: { id: parsed.data.linkId },
    select: {
      id: true,
      projectId: true,
      task: { select: { key: true } },
    },
  });
  if (!link) return { ok: true as const };

  const context = await requireProjectRole(link.projectId, ProjectRole.MEMBER);
  if (!context) return { ok: false as const, formError: "Недостаточно прав" };

  await prisma.knowledgeLink.delete({ where: { id: link.id } });
  revalidatePath(`/tasks/${link.task.key}`);
  return { ok: true as const };
}
