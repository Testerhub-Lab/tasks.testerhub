import type { Prisma } from "@prisma/client";
import type { TaskStatus } from "../../shared/taskEnums";
import prisma from "../../lib/prisma";
import { getZeroPool, type ZeroTransaction } from "../../zero/db";
import { usesZeroUiStore, zeroStateToLegacyStatus } from "../ui/zero-legacy";

export type RelatedIssue = {
  id: string;
  key: string;
  title: string;
  status: TaskStatus;
  type: string;
};

const summary = { id: true, key: true, title: true, status: true, type: true } as const;
async function zeroIssueSummaries(filter: string, values: (string | null)[]): Promise<RelatedIssue[]> {
  type Row = Omit<RelatedIssue, "status"> & Parameters<typeof zeroStateToLegacyStatus>[0];
  const { rows } = await getZeroPool().query<Row>(
    `SELECT i.id, p.key || '-' || i.number AS key, i.title, i.type, s.name, s.category
     FROM issues i JOIN projects p ON p.id = i.project_id JOIN workflow_states s ON s.id = i.state_id
     WHERE i.project_id = $1 AND i.archived_at IS NULL AND ${filter}`,
    values
  );
  return rows.map(({ name, category, ...issue }) => ({ ...issue, status: zeroStateToLegacyStatus({ name, category }) }));
}

export async function getIssueHierarchy(task: { id: string; parentId: string | null; projectId: string }) {
  const rows = usesZeroUiStore()
    ? await zeroIssueSummaries("(i.parent_id = $2 OR i.id = $3) ORDER BY i.number", [task.projectId, task.id, task.parentId])
    : await prisma.task.findMany({
        where: { projectId: task.projectId, isDeleted: false,
          OR: [{ parentId: task.id }, ...(task.parentId ? [{ id: task.parentId }] : [])] },
        select: summary, orderBy: { number: "asc" },
      });
  return { parent: rows.find(row => row.id === task.parentId), children: rows.filter(row => row.id !== task.parentId) };
}

export async function findEpicCandidates(projectId: string, query: string): Promise<RelatedIssue[]> {
  // Treat SQL pattern characters in a title or key as literal user input.
  const term = query.trim().replace(/[\\%_]/g, "\\$&");
  if (usesZeroUiStore()) {
    return zeroIssueSummaries(
      `i.parent_id IS NULL AND upper(i.type) <> 'EPIC'
       AND (i.title ILIKE $2 OR (p.key || '-' || i.number) ILIKE $2)
       ORDER BY (p.key || '-' || i.number = $3) DESC, i.number DESC LIMIT 25`,
      [projectId, `%${term}%`, query.trim().toUpperCase()]
    );
  }
  return prisma.$queryRaw<RelatedIssue[]>`
    SELECT id, key, title, status::text, type FROM "Task"
    WHERE "projectId" = ${projectId} AND NOT "isDeleted" AND "parentId" IS NULL AND upper(type) <> 'EPIC'
      AND (title ILIKE ${"%" + term + "%"} OR key ILIKE ${"%" + term + "%"})
    ORDER BY (key = ${query.trim().toUpperCase()}) DESC, number DESC LIMIT 25`;
}

type ParentLink = { projectId: string; childId: string; parentId: string; existing: boolean };
export class IssueParentError extends Error {
  constructor() { super("Не удалось связать задачи. Проверьте проект, родителя и доступность задачи."); }
}

// Only newly created issues may become subtasks. An existing issue can join a root epic
// if it has no parent. This also makes retries safe and prevents cycles or silent moves.
export async function setZeroIssueParent(tx: ZeroTransaction, link: ParentLink) {
  const rows = await tx.dbTransaction.query(
    `UPDATE issues c SET parent_id = p.id, updated_at = now()
     FROM issues p JOIN projects project ON project.id = p.project_id AND project.archived_at IS NULL
     WHERE c.project_id = $1 AND p.project_id = c.project_id AND c.id = $2 AND p.id = $3
       AND c.id <> p.id AND upper(c.type) <> 'EPIC'
       AND c.archived_at IS NULL AND p.archived_at IS NULL
       AND (c.parent_id IS NULL OR c.parent_id = p.id)
       AND (NOT $4::boolean OR upper(p.type) = 'EPIC') RETURNING c.id`,
    [link.projectId, link.childId, link.parentId, link.existing]
  );
  if (![...rows].length) throw new IssueParentError();
}

export async function setPrismaIssueParent(tx: Prisma.TransactionClient, link: ParentLink) {
  const count = await tx.$executeRaw`
    UPDATE "Task" c SET "parentId" = p.id, "updatedAt" = now()
    FROM "Task" p JOIN "Project" project ON project.id = p."projectId" AND project."archivedAt" IS NULL
    WHERE c."projectId" = ${link.projectId} AND p."projectId" = c."projectId"
      AND c.id = ${link.childId} AND p.id = ${link.parentId} AND c.id <> p.id AND upper(c.type) <> 'EPIC'
      AND NOT c."isDeleted" AND NOT p."isDeleted"
      AND (c."parentId" IS NULL OR c."parentId" = p.id)
      AND (NOT ${link.existing} OR upper(p.type) = 'EPIC')`;
  if (!count) throw new IssueParentError();
}
