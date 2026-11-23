import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import prisma from "@/lib/prisma";
import {
  DEFAULT_RELEASE_ISSUE_STATUS_FILTER, type Release, type ReleaseIssue, type ReleaseIssueStatusFilter, type ReleaseOption,
} from "@/shared/releases";
import { getZeroPool } from "@/zero/db";
import { usesZeroUiStore, zeroStatusSQL } from "../ui/zero-legacy";
import type { ReleaseAnalysisIssue } from "../releases/suggestReleases";

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
      archived: "(issue.archived_at IS NOT NULL)",
      stateJoin: "JOIN workflow_states state ON state.id = issue.state_id",
      status: `(${zeroStatusSQL})`,
      parentJoin: "LEFT JOIN issues parent ON parent.project_id = issue.project_id AND parent.id = issue.parent_id",
      parentKey: "project.key || '-' || parent.number",
      tags: `ARRAY(SELECT tag.name FROM issue_tags link JOIN tags tag ON tag.id = link.tag_id
        WHERE link.issue_id = issue.id AND tag.archived_at IS NULL ORDER BY tag.name)`,
      idType: "uuid",
    }
  : {
      table: '"Task" issue',
      project: 'issue."projectId"',
      key: "issue.key",
      projectJoin: "",
      archived: 'issue."isDeleted"',
      stateJoin: "",
      status: "issue.status::text",
      parentJoin: 'LEFT JOIN "Task" parent ON parent."projectId" = issue."projectId" AND parent.id = issue."parentId"',
      parentKey: "parent.key",
      tags: "issue.tags",
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

export function getOpenProjectReleases(projectId: string) {
  return query<ReleaseOption>(
    `SELECT id, title, status FROM releases
     WHERE project_id = $1 AND status <> 'released' ORDER BY created_at DESC, id`,
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
    `SELECT issue.id, ${source.key} AS key, issue.title, issue.type,
       ${source.status} AS status, ${source.archived} AS archived
     FROM ${source.table} ${source.projectJoin} ${source.stateJoin}
     JOIN release_issues assigned ON assigned.issue_id = issue.id
     WHERE assigned.project_id = $1 AND assigned.release_id = $2::uuid
     ORDER BY issue.number`,
    [projectId, releaseId]
  );
}

export async function getAvailableReleaseIssues(
  projectId: string, term = "", status: ReleaseIssueStatusFilter = DEFAULT_RELEASE_ISSUE_STATUS_FILTER, page = 0
) {
  const source = issueSource();
  const rows = await query<ReleaseIssue>(
    `SELECT issue.id, ${source.key} AS key, issue.title, issue.type, ${source.status} AS status, false AS archived
     FROM ${source.table} ${source.projectJoin} ${source.stateJoin}
     WHERE ${source.project} = $1 AND NOT ${source.archived}
       AND ($2 = '' OR strpos(lower(issue.title), lower($2)) > 0 OR strpos(lower(${source.key}), lower($2)) > 0)
       AND CASE $3::text
         WHEN 'open' THEN ${source.status} NOT IN ('DONE', 'REJECT')
         WHEN 'all' THEN true
         ELSE ${source.status} = $3
       END
       AND NOT EXISTS (SELECT 1 FROM release_issues WHERE project_id = $1 AND issue_id = issue.id)
     ORDER BY (lower(${source.key}) = lower($2)) DESC, issue.number DESC LIMIT 51 OFFSET $4::int`,
    [projectId, term, status, page * 50]
  );
  return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
}

export function getReleaseAnalysisIssues(projectId: string) {
  const source = issueSource();
  return query<ReleaseAnalysisIssue>(
    `SELECT issue.id, ${source.key} AS key, issue.title, issue.type, issue.priority,
       left(issue.description, 4000) AS description, ${source.tags} AS tags,
       CASE WHEN parent.id IS NOT NULL THEN json_build_object(
         'id', parent.id, 'key', ${source.parentKey}, 'title', parent.title, 'type', parent.type
       ) END AS parent
     FROM ${source.table} ${source.projectJoin} ${source.stateJoin} ${source.parentJoin}
     WHERE ${source.project} = $1 AND NOT ${source.archived} AND ${source.status} = 'NEW'
       AND NOT EXISTS (SELECT 1 FROM release_issues WHERE project_id = $1 AND issue_id = issue.id)
     ORDER BY issue.number`,
    [projectId]
  );
}

export async function getIssueReleaseAssignments(tasks: { id: string; projectId: string }[]) {
  if (!tasks.length) return {};
  const { idType } = issueSource();
  const rows = await query<ReleaseOption & { issueId: string }>(
    `SELECT assigned.issue_id AS "issueId", r.id, r.title, r.status
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

    const eligibility = await lockReleaseCandidates(run, projectId, uniqueIds, releaseId);
    if (eligibility !== "ok") return eligibility;
    await attachReleaseIssues(run, projectId, releaseId, uniqueIds);
    return "ok";
  });
}

async function lockReleaseCandidates(run: Query, projectId: string, issueIds: string[], releaseId: string | null) {
  const source = issueSource();
  const ids = JSON.stringify(issueIds);
  // Lock issues in ID order so two planners cannot add the same tasks to different releases.
  const issues = await run<{ id: string }>(
    `SELECT issue.id FROM ${source.table} ${releaseId ? "" : source.stateJoin}
     WHERE ${source.project} = $1 AND NOT ${source.archived}
       ${releaseId ? "" : `AND ${source.status} = 'NEW'`}
       AND issue.id IN (${idsFromJson("$2", source.idType)})
     ORDER BY issue.id FOR UPDATE OF issue`,
    [projectId, ids]
  );
  if (issues.length !== issueIds.length) return "unavailable";
  const [conflict] = await run<{ issue_id: string }>(
    `SELECT issue_id FROM release_issues WHERE project_id = $1 AND release_id IS DISTINCT FROM $2::uuid
     AND issue_id IN (${idsFromJson("$3", source.idType)}) LIMIT 1`,
    [projectId, releaseId, ids]
  );
  return conflict ? "assigned" : "ok";
}

function attachReleaseIssues(run: Query, projectId: string, releaseId: string, issueIds: string[]) {
  return run(
    `INSERT INTO release_issues (project_id, release_id, issue_id)
     SELECT $1, $2::uuid, id FROM (${idsFromJson("$3", issueSource().idType)}) selected(id)
     ON CONFLICT (project_id, issue_id) DO NOTHING RETURNING issue_id`,
    [projectId, releaseId, JSON.stringify(issueIds)]
  );
}

export function createSuggestedReleaseDraft(projectId: string, title: string, goal: string, issueIds: string[]) {
  return inTransaction(async (run) => {
    const ids = [...new Set(issueIds)];
    const eligibility = await lockReleaseCandidates(run, projectId, ids, null);
    if (eligibility !== "ok") return { ok: false as const };
    const releaseId = randomUUID();
    await run(
      `INSERT INTO releases (project_id, id, title, goal) VALUES ($1, $2::uuid, $3, $4) RETURNING id`,
      [projectId, releaseId, title, goal]
    );
    const assigned = await attachReleaseIssues(run, projectId, releaseId, ids);
    if (assigned.length !== ids.length) throw new Error("Draft release assignment changed concurrently");
    return { ok: true as const, releaseId };
  });
}

export function setIssueRelease(
  projectId: string,
  issueId: string,
  previousReleaseId: string | null,
  releaseId: string | null
) {
  const source = issueSource();
  return inTransaction(async (run) => {
    // Use the same lock order as bulk edits: release rows before issue rows.
    const releaseIds = new Set([previousReleaseId, releaseId].filter(Boolean));
    if (releaseIds.size) {
      const releases = await run<{ id: string }>(
        `SELECT id FROM releases WHERE project_id = $1
         AND id IN ($2::uuid, $3::uuid) AND status <> 'released'
         ORDER BY id FOR UPDATE`,
        [projectId, previousReleaseId, releaseId]
      );
      if (releases.length !== releaseIds.size) return "closed";
    }

    const [issue] = await run<{ id: string }>(
      `SELECT issue.id FROM ${source.table}
       WHERE ${source.project} = $1 AND issue.id = $2 AND NOT ${source.archived}
       FOR UPDATE OF issue`,
      [projectId, issueId]
    );
    if (!issue) return "unavailable";

    const [assignment] = await run<{ release_id: string }>(
      `SELECT release_id FROM release_issues WHERE project_id = $1 AND issue_id = $2`,
      [projectId, issueId]
    );
    const assignedId = assignment?.release_id ?? null;
    if (assignedId === releaseId) return "ok";
    if (assignedId !== previousReleaseId) return "stale";

    if (releaseId) {
      await run(
        `INSERT INTO release_issues (project_id, issue_id, release_id) VALUES ($1, $2, $3::uuid)
         ON CONFLICT (project_id, issue_id) DO UPDATE SET release_id = EXCLUDED.release_id
         RETURNING issue_id`,
        [projectId, issueId, releaseId]
      );
    } else {
      await run(
        `DELETE FROM release_issues WHERE project_id = $1 AND issue_id = $2 RETURNING issue_id`,
        [projectId, issueId]
      );
    }
    return "ok";
  });
}
