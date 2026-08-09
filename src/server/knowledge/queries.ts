import prisma from "@/lib/prisma";
import { KnowledgeProvider } from "@prisma/client";
import {
  getZeroProjectKnowledge,
  getZeroTaskKnowledgeLinks,
  getZeroWikiPage,
  getZeroWikiCommentThreads,
  getZeroWikiPageRevisions,
  getZeroWikiReviewDecisions,
  getZeroWikiPageTree,
  searchZeroWikiPages,
  usesZeroUiStore,
} from "@/server/ui/zero-legacy";

export async function getProjectKnowledge(projectId: string) {
  if (usesZeroUiStore()) {
    return getZeroProjectKnowledge(projectId);
  }
  const stored = await prisma.projectKnowledge.findUnique({
    where: { projectId },
    select: {
      id: true,
      provider: true,
      externalUrl: true,
      updatedAt: true,
    },
  });

  return (
    stored ?? {
      id: null,
      provider: KnowledgeProvider.DISABLED,
      externalUrl: null,
      updatedAt: null,
    }
  );
}

export async function getWikiPageTree(
  projectId: string,
  options?: { includeArchived?: boolean }
) {
  if (usesZeroUiStore()) {
    return getZeroWikiPageTree(projectId, options);
  }
  return prisma.wikiPage.findMany({
    where: {
      projectId,
      ...(options?.includeArchived ? {} : { archivedAt: null }),
    },
    select: {
      id: true,
      parentId: true,
      title: true,
      slug: true,
      sortOrder: true,
      version: true,
      archivedAt: true,
      updatedAt: true,
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
}

export async function getWikiPage(projectId: string, pageId: string) {
  if (usesZeroUiStore()) {
    return getZeroWikiPage(projectId, pageId);
  }
  return prisma.wikiPage.findFirst({
    where: {
      id: pageId,
      projectId,
      archivedAt: null,
    },
    select: {
      id: true,
      projectId: true,
      parentId: true,
      title: true,
      slug: true,
      contentMarkdown: true,
      version: true,
      workflowStatus: true,
      reviewVersion: true,
      approvedVersion: true,
      reviewRequestedAt: true,
      reviewRequestedBy: { select: { name: true } },
      reviewAssigneeId: true,
      reviewAssignee: { select: { id: true, name: true, email: true } },
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function searchWikiPages(projectId: string, query: string) {
  const normalized = query.trim();
  if (!normalized) return [];
  if (usesZeroUiStore()) {
    return searchZeroWikiPages(projectId, normalized);
  }

  return prisma.wikiPage.findMany({
    where: {
      projectId,
      archivedAt: null,
      OR: [
        { title: { contains: normalized, mode: "insensitive" } },
        { contentMarkdown: { contains: normalized, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      title: true,
      contentMarkdown: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}

export async function getWikiPageRevisions(pageId: string) {
  if (usesZeroUiStore()) {
    return getZeroWikiPageRevisions(pageId);
  }
  return prisma.wikiPageRevision.findMany({
    where: { pageId },
    select: {
      id: true,
      version: true,
      title: true,
      createdAt: true,
      createdBy: { select: { name: true, email: true } },
    },
    orderBy: { version: "desc" },
    take: 30,
  });
}

export async function getWikiReviewDecisions(pageId: string) {
  if (usesZeroUiStore()) return getZeroWikiReviewDecisions(pageId);
  return prisma.wikiReviewDecision.findMany({
    where: { pageId },
    select: {
      id: true,
      decision: true,
      comment: true,
      createdAt: true,
      revision: { select: { version: true } },
      reviewer: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  }).then((rows) =>
    rows.map((row) => ({
      id: row.id,
      decision: row.decision,
      comment: row.comment,
      createdAt: row.createdAt,
      version: row.revision.version,
      reviewer: row.reviewer,
    }))
  );
}

export async function getWikiCommentThreads(pageId: string) {
  if (usesZeroUiStore()) return getZeroWikiCommentThreads(pageId);
  return prisma.wikiCommentThread.findMany({
    where: { pageId, archivedAt: null },
    select: {
      id: true,
      revisionId: true,
      anchorQuote: true,
      status: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      resolvedAt: true,
      revision: { select: { version: true } },
      comments: {
        where: { archivedAt: null },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { name: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  }).then((rows) =>
    rows.map((row) => ({
      id: row.id,
      revisionId: row.revisionId,
      revisionVersion: row.revision.version,
      anchorQuote: row.anchorQuote,
      status: row.status,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      resolvedAt: row.resolvedAt,
      comments: row.comments,
    }))
  );
}

export async function getTaskKnowledgeLinks(taskId: string) {
  if (usesZeroUiStore()) {
    return getZeroTaskKnowledgeLinks(taskId);
  }
  return prisma.knowledgeLink.findMany({
    where: { taskId },
    select: {
      id: true,
      provider: true,
      documentKey: true,
      title: true,
      url: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}
