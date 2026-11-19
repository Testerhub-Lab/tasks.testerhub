import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import { usesZeroAuthStore } from "../auth/zero-store";
import { getZeroPool } from "../../zero/db";

export type WorkspaceWikiScope = { userId: string; workspaceId: string };
type Area = { name: string; canWrite: boolean };
export type WorkspaceArticle = { id: string; title: string; markdown: string; version: number };

function membership({ workspaceId, userId }: WorkspaceWikiScope) {
  if (usesZeroAuthStore()) {
    return Prisma.sql`SELECT w.id, w.name, m.role IN ('OWNER', 'ADMIN', 'MEMBER') AS "canWrite"
      FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
      WHERE w.id = ${workspaceId} AND m.user_id = ${userId} AND w.archived_at IS NULL`;
  }
  return Prisma.sql`SELECT w.id, w.name, TRUE AS "canWrite"
    FROM "Workspace" w JOIN "WorkspaceMember" m ON m."workspaceId" = w.id
    WHERE w.id = ${workspaceId} AND m."userId" = ${userId}`;
}

async function query<T extends object>(statement: Prisma.Sql): Promise<T[]> {
  if (usesZeroAuthStore()) {
    return (await getZeroPool().query<T>(statement.text, statement.values)).rows;
  }
  return prisma.$queryRaw<T[]>(statement);
}

export async function workspaceWikiArea(scope: WorkspaceWikiScope) {
  return (await query<Area>(membership(scope)))[0] ?? null;
}

export function listWorkspaceArticles(scope: WorkspaceWikiScope) {
  return query<Pick<WorkspaceArticle, "id" | "title">>(Prisma.sql`
    SELECT p.id, p.title FROM workspace_wiki_pages p
    JOIN (${membership(scope)}) area ON area.id = p.workspace_id ORDER BY p.title, p.id`);
}

export async function readWorkspaceArticle(scope: WorkspaceWikiScope, id: string) {
  const rows = await query<WorkspaceArticle & Area>(Prisma.sql`
    SELECT p.id, p.title, p.content_markdown AS markdown, p.version, area.name, area."canWrite"
    FROM workspace_wiki_pages p JOIN (${membership(scope)}) area ON area.id = p.workspace_id
    WHERE p.id = ${id}::uuid`);
  return rows[0] ?? null;
}

export async function saveWorkspaceArticle(scope: WorkspaceWikiScope, page: WorkspaceArticle) {
  const area = membership(scope);
  const rows = await query<{ id: string }>(page.version === 0 ? Prisma.sql`
    INSERT INTO workspace_wiki_pages (id, workspace_id, title, content_markdown)
    SELECT ${page.id}::uuid, area.id, ${page.title}, ${page.markdown} FROM (${area}) area
    WHERE area."canWrite" ON CONFLICT (id) DO NOTHING RETURNING id` : Prisma.sql`
    UPDATE workspace_wiki_pages p SET title = ${page.title}, content_markdown = ${page.markdown}, version = version + 1
    FROM (${area}) area WHERE area."canWrite" AND p.workspace_id = area.id
    AND p.id = ${page.id}::uuid AND p.version = ${page.version} RETURNING p.id`);
  if (rows.length) return true;
  // A retry may follow a successful save whose response never reached the browser.
  const saved = await readWorkspaceArticle(scope, page.id);
  return saved?.canWrite === true && saved.version === page.version + 1 &&
    saved.title === page.title && saved.markdown === page.markdown;
}
