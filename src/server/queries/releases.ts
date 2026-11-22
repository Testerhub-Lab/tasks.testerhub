import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import prisma from "@/lib/prisma";
import type { Release, ReleaseIssue } from "@/shared/releases";
import { getZeroPool } from "@/zero/db";
import { usesZeroUiStore, zeroStatusSQL } from "../ui/zero-legacy";

type Query = <Row extends QueryResultRow>(sql: string, params: unknown[]) => Promise<Row[]>;

const query: Query = async (sql, params) =>
  usesZeroUiStore()
    ? (await getZeroPool().query(sql, params)).rows
    : prisma.$queryRawUnsafe(sql, ...params);

async function inTransaction<T>(work: (run: Query) => Promise<T>) {
  if (!usesZeroUiStore()) {
    return prisma.$transaction((tx) =>
      work((sql, params) => tx.$queryRawUnsafe(sql, ...params))
    );
  }

  const client = await getZeroPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(async (sql, params) => (await client.query(sql, params)).rows);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}

// Both stores use the same release tables. Only the existing issue schema differs.
const issueSource = () => usesZeroUiStore()
  ? {
      table: "issues issue",
      project: "issue.project_id",
      key: "project.key || '-' || issue.number",
      projectJoin: "JOIN projects project ON project.id = issue.project_id",
      stateJoin: "JOIN workflow_states state ON state.id = issue.state_id",
      archived: "(issue.archived_at IS NOT NULL)",
      isBacklog: `(${zeroStatusSQL}) = 'NEW'`,
      idType: "uuid",
    }
  : {
      table: '"Task" issue',
      project: 'issue."projectId"',
      key: "issue.key",
      projectJoin: "",
      stateJoin: "",
      archived: 'issue."isDeleted"',
      isBacklog: "issue.status = 'NEW'",
      idType: "text",
    };

const releaseColumns = `r.id, r.title, r.goal, to_char(r.planned_date, 'YYYY-MM-DD') AS "plannedDate", r.status`;
const idsFromJson = (parameter: string, type: string) =>
  `SELECT value::${type} FROM jsonb_array_elements_text(${parameter}::jsonb)`;

export async function getProjectReleases(projectId: string) {
  return query<Release & { issueCount: number }>(
    `SELECT ${releaseColumns},
      (SELECT count(*)::int FROM release_issues WHERE release_id = r.id) AS "issueCount"
     FROM releases r WHERE r.project_id = $1
     ORDER BY r.created_at DESC, r.id`,
    [projectId]
  );
}

export async function getProjectRelease(projectId: string, releaseId: string) {
  const [release] = await query<Release>(
    `SELECT ${releaseColumns} FROM releases r WHERE r.project_id = $1 AND r.id = $2::uuid`,
    [projectId, releaseId]
  );
  return release;
}

export function getReleaseIssues(projectId: string, releaseId: string) {
  const source = issueSource();
  return query<ReleaseIssue>(
    `SELECT issue.id, ${source.key} AS key, issue.title, ${source.archived} AS archived
     FROM ${source.table} ${source.projectJoin}
     JOIN release_issues assigned ON assigned.issue_id = issue.id
     WHERE assigned.project_id = $1 AND assigned.release_id = $2::uuid
     ORDER BY issue.number`,
    [projectId, releaseId]
  );
}

export function getUnscheduledBacklog(projectId: string) {
  const source = issueSource();
  return query<Pick<ReleaseIssue, "id" | "key" | "title">>(
    `SELECT issue.id, ${source.key} AS key, issue.title
     FROM ${source.table} ${source.projectJoin} ${source.stateJoin}
     WHERE ${source.project} = $1 AND NOT ${source.archived} AND ${source.isBacklog}
       AND NOT EXISTS (SELECT 1 FROM release_issues WHERE project_id = $1 AND issue_id = issue.id)
     ORDER BY issue.number DESC`,
    [projectId]
  );
}

export async function getBacklogReleaseLinks(tasks: { id: string; projectId: string }[]) {
  if (!tasks.length) return {};
  const { idType } = issueSource();
  const rows = await query<{ issueId: string; id: string; title: string }>(
    `SELECT assigned.issue_id AS "issueId", r.id, r.title
     FROM release_issues assigned JOIN releases r ON r.id = assigned.release_id
     WHERE assigned.project_id IN (${idsFromJson("$1", idType)})
       AND assigned.issue_id IN (${idsFromJson("$2", idType)})`,
    [JSON.stringify([...new Set(tasks.map((task) => task.projectId))]), JSON.stringify(tasks.map((task) => task.id))]
  );
  return Object.fromEntries(rows.map(({ issueId, ...release }) => [issueId, release]));
}

export async function saveProjectRelease(
  projectId: string,
  data: Pick<Release, "title" | "goal" | "plannedDate"> & { id?: string; status?: Release["status"] }
) {
  const { id, title, goal, plannedDate, status } = data;
  const [release] = id
    ? await query<{ id: string }>(
        `UPDATE releases SET title = $3, goal = $4, planned_date = $5::date,
           status = coalesce($6, status)
         WHERE project_id = $1 AND id = $2::uuid RETURNING id`,
        [projectId, id, title, goal, plannedDate, status ?? null]
      )
    : await query<{ id: string }>(
        `INSERT INTO releases (project_id, id, title, goal, planned_date)
         VALUES ($1, $2::uuid, $3, $4, $5::date) RETURNING id`,
        [projectId, randomUUID(), title, goal, plannedDate]
      );
  return release;
}

export async function changeReleaseIssues(
  projectId: string,
  releaseId: string,
  issueIds: string[],
  operation: "add" | "remove"
) {
  const source = issueSource();
  const uniqueIds = [...new Set(issueIds)];
  const ids = JSON.stringify(uniqueIds);
  return inTransaction(async (run) => {
    const [release] = await run<{ id: string }>(
      `SELECT id FROM releases
       WHERE project_id = $1 AND id = $2::uuid AND status <> 'released' FOR UPDATE`,
      [projectId, releaseId]
    );
    if (!release) return "closed";

    if (operation === "remove") {
      await run(
        `DELETE FROM release_issues WHERE project_id = $1 AND release_id = $2::uuid
         AND issue_id IN (${idsFromJson("$3", source.idType)}) RETURNING issue_id`,
        [projectId, releaseId, ids]
      );
      return "ok";
    }

    // Lock in ID order before checking assignments, including when two releases compete.
    const issues = await run<{ id: string }>(
      `SELECT issue.id FROM ${source.table} ${source.stateJoin}
       WHERE ${source.project} = $1 AND NOT ${source.archived} AND ${source.isBacklog}
         AND issue.id IN (${idsFromJson("$2", source.idType)})
       ORDER BY issue.id FOR UPDATE OF issue`,
      [projectId, ids]
    );
    if (issues.length !== uniqueIds.length) return "unavailable";

    const [conflict] = await run<{ issue_id: string }>(
      `SELECT issue_id FROM release_issues WHERE project_id = $1 AND release_id <> $2::uuid
       AND issue_id IN (${idsFromJson("$3", source.idType)}) LIMIT 1`,
      [projectId, releaseId, ids]
    );
    if (conflict) return "assigned";

    await run(
      `INSERT INTO release_issues (project_id, release_id, issue_id)
       SELECT $1, $2::uuid, id FROM (${idsFromJson("$3", source.idType)}) selected(id)
       ON CONFLICT (project_id, issue_id) DO NOTHING RETURNING issue_id`,
      [projectId, releaseId, ids]
    );
    return "ok";
  });
}
