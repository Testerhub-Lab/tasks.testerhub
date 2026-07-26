import prisma from "@/lib/prisma";
import { KnowledgeProvider } from "@prisma/client";

export async function getProjectKnowledge(projectId: string) {
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

export async function getTaskKnowledgeLinks(taskId: string) {
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
