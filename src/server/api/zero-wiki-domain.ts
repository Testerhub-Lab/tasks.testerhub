import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  getZeroDatabase,
  withZeroTransaction,
  type ZeroTransaction,
} from "@/zero/db";
import { zeroMutators } from "@/zero/mutators";
import { zeroQueries } from "@/zero/queries";
import { issueKey } from "@/zero/stage3";
import type { ApiActor } from "./auth";
import { ApiError } from "./errors";
import type {
  createWikiPageApiSchema,
  updateWikiPageApiSchema,
} from "./schemas";
import {
  requireApiIssueByKey,
  requireApiProjectByKey,
} from "./zero-domain";

type CreateWikiPageInput = z.infer<typeof createWikiPageApiSchema>;
type UpdateWikiPageInput = z.infer<typeof updateWikiPageApiSchema>;

function iso(value: number) {
  return new Date(value).toISOString();
}

function publicUser(
  user: { displayName?: string | null } | undefined
) {
  return user
    ? {
        name: user.displayName ?? null,
        email: null,
      }
    : null;
}

function knowledge(project: {
  knowledgeProvider: "DISABLED" | "NATIVE" | "EXTERNAL";
  knowledgeExternalURL?: string | null;
}) {
  return {
    provider: project.knowledgeProvider,
    externalUrl: project.knowledgeExternalURL ?? null,
  };
}

function requireNativeWiki(project: {
  knowledgeProvider: "DISABLED" | "NATIVE" | "EXTERNAL";
}) {
  if (project.knowledgeProvider !== "NATIVE") {
    throw new ApiError(
      409,
      "wiki_not_native",
      "Для проекта не включена нативная Wiki"
    );
  }
}

function asWikiApiError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof Error) {
    const version = /^Wiki version conflict:(\d+)$/.exec(error.message)?.[1];
    if (version) {
      throw new ApiError(
        409,
        "version_conflict",
        `Страница уже имеет версию ${version}`
      );
    }
    if (error.message === "Native Wiki is disabled") {
      throw new ApiError(
        409,
        "wiki_not_native",
        "Для проекта не включена нативная Wiki"
      );
    }
    if (error.message === "Wiki parent access denied") {
      throw new ApiError(
        400,
        "invalid_parent",
        "Родительская Wiki-страница не найдена"
      );
    }
    if (error.message === "Wiki page access denied") {
      throw new ApiError(
        404,
        "wiki_page_not_found",
        "Wiki-страница не найдена"
      );
    }
    if (/access denied|administration denied/i.test(error.message)) {
      throw new ApiError(403, "forbidden", error.message);
    }
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  ) {
    throw new ApiError(409, "conflict", "Wiki-страница уже существует");
  }
  throw error;
}

async function wikiPageRow(
  userID: string,
  pageID: string,
  transaction?: ZeroTransaction
) {
  const query = zeroQueries.wikiPages.byID.fn({
    args: { pageID },
    ctx: { userID },
  });
  const page = transaction
    ? await transaction.run(query)
    : await getZeroDatabase().run(query);
  if (!page || !page.project) {
    throw new ApiError(
      404,
      "wiki_page_not_found",
      "Wiki-страница не найдена"
    );
  }
  requireNativeWiki(page.project);
  return { ...page, project: page.project };
}

function serializeWikiPageSummary(page: {
  id: string;
  parentID?: string | null;
  title: string;
  slug: string;
  sortOrder: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  updater?: { displayName?: string | null };
}) {
  return {
    id: page.id,
    parentId: page.parentID ?? null,
    title: page.title,
    slug: page.slug,
    sortOrder: page.sortOrder,
    version: page.version,
    createdAt: iso(page.createdAt),
    updatedAt: iso(page.updatedAt),
    updatedBy: publicUser(page.updater),
  };
}

export async function listApiWikiPages(
  user: ApiActor,
  projectKey: string,
  query: string
) {
  const match = await requireApiProjectByKey(user.id, projectKey);
  const project = match.project;
  const projectKnowledge = knowledge(project);
  if (project.knowledgeProvider !== "NATIVE") {
    return {
      project: {
        id: project.id,
        key: project.key,
        name: project.name,
      },
      knowledge: projectKnowledge,
      pages: [],
    };
  }

  const pages = await getZeroDatabase().run(
    zeroQueries.wikiPages.byProject.fn({
      args: { projectID: project.id },
      ctx: { userID: user.id },
    })
  );
  const needle = query.trim().toLowerCase();
  const selected = needle
    ? pages
        .filter(
          (page) =>
            page.title.toLowerCase().includes(needle) ||
            page.contentMarkdown.toLowerCase().includes(needle)
        )
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 50)
    : pages;

  return {
    project: {
      id: project.id,
      key: project.key,
      name: project.name,
    },
    knowledge: projectKnowledge,
    pages: selected.map((page) => ({
      ...serializeWikiPageSummary(page),
      ...(needle
        ? {
            excerpt: page.contentMarkdown
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 500),
          }
        : {}),
    })),
  };
}

export async function getApiWikiPage(user: ApiActor, pageID: string) {
  const page = await wikiPageRow(user.id, pageID);
  const revisions = await getZeroDatabase().run(
    zeroQueries.wikiPageRevisions.byPage.fn({
      args: { pageID: page.id },
      ctx: { userID: user.id },
    })
  );
  return {
    id: page.id,
    projectId: page.projectID,
    parentId: page.parentID ?? null,
    title: page.title,
    slug: page.slug,
    contentMarkdown: page.contentMarkdown,
    version: page.version,
    archivedAt: null,
    createdAt: iso(page.createdAt),
    updatedAt: iso(page.updatedAt),
    createdBy: publicUser(page.creator),
    updatedBy: publicUser(page.updater),
    project: {
      id: page.project.id,
      key: page.project.key,
      name: page.project.name,
      workspaceId: page.project.workspaceID,
      knowledge: knowledge(page.project),
    },
    revisions: revisions.slice(0, 30).map((revision) => ({
      id: revision.id,
      version: revision.version,
      title: revision.title,
      createdAt: iso(revision.createdAt),
      createdBy: publicUser(revision.creator),
    })),
  };
}

export async function createApiWikiPage(
  user: ApiActor,
  projectKey: string,
  input: CreateWikiPageInput,
  transaction?: ZeroTransaction
) {
  const match = await requireApiProjectByKey(user.id, projectKey);
  requireNativeWiki(match.project);
  const id = randomUUID();
  try {
    return await withZeroTransaction(transaction, async (tx) => {
      await zeroMutators.wikiPages.create.fn({
        args: {
          id,
          revisionID: randomUUID(),
          projectID: match.project.id,
          parentID: input.parentId,
          title: input.title,
          contentMarkdown: input.contentMarkdown,
        },
        ctx: { userID: user.id },
        tx,
      });
      const page = await wikiPageRow(user.id, id, tx);
      return {
        id: page.id,
        parentId: page.parentID ?? null,
        title: page.title,
        slug: page.slug,
        contentMarkdown: page.contentMarkdown,
        version: page.version,
        project: {
          id: match.project.id,
          key: match.project.key,
          name: match.project.name,
        },
        createdAt: iso(page.createdAt),
        updatedAt: iso(page.updatedAt),
      };
    });
  } catch (error) {
    asWikiApiError(error);
  }
}

export async function updateApiWikiPage(
  user: ApiActor,
  pageID: string,
  input: UpdateWikiPageInput,
  transaction?: ZeroTransaction
) {
  await wikiPageRow(user.id, pageID);
  try {
    return await withZeroTransaction(transaction, async (tx) => {
      await zeroMutators.wikiPages.update.fn({
        args: {
          id: pageID,
          revisionID: randomUUID(),
          title: input.title,
          contentMarkdown: input.contentMarkdown,
          expectedVersion: input.expectedVersion,
        },
        ctx: { userID: user.id },
        tx,
      });
      const page = await wikiPageRow(user.id, pageID, tx);
      return {
        id: page.id,
        parentId: page.parentID ?? null,
        title: page.title,
        slug: page.slug,
        contentMarkdown: page.contentMarkdown,
        version: page.version,
        project: {
          id: page.project.id,
          key: page.project.key,
          name: page.project.name,
        },
        createdAt: iso(page.createdAt),
        updatedAt: iso(page.updatedAt),
      };
    });
  } catch (error) {
    asWikiApiError(error);
  }
}

export async function linkApiIssueToWiki(
  user: ApiActor,
  key: string,
  pageID: string,
  transaction?: ZeroTransaction
) {
  const row = await requireApiIssueByKey(user.id, key);
  requireNativeWiki(row.project);
  try {
    return await withZeroTransaction(transaction, async (tx) => {
      await zeroMutators.issueWikiLinks.create.fn({
        args: {
          id: randomUUID(),
          issueID: row.issue.id,
          pageID,
        },
        ctx: { userID: user.id },
        tx,
      });
      const links = await tx.run(
        zeroQueries.issueWikiLinks.byIssue.fn({
          args: { issueID: row.issue.id },
          ctx: { userID: user.id },
        })
      );
      const link = links.find((candidate) => candidate.pageID === pageID);
      if (!link?.page) {
        throw new ApiError(
          404,
          "wiki_page_not_found",
          "Wiki-страница не найдена"
        );
      }
      return {
        id: link.id,
        provider: "NATIVE" as const,
        documentKey: link.page.id,
        title: link.page.title,
        url: null,
        createdAt: iso(link.createdAt),
        issueKey: issueKey(row.project.key, row.issue.number),
      };
    });
  } catch (error) {
    asWikiApiError(error);
  }
}
