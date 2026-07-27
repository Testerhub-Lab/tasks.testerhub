import type { Pool } from "pg";

type IssueSearchPool = Pick<Pool, "query">;

export type IssueSearchInput = {
  userID: string;
  query: string;
  projectKey?: string | null;
  statuses: string[];
  limit: number;
};

export const issueSearchSQL = `
WITH scoped AS (
  SELECT
    issue.id,
    issue.title,
    coalesce(issue.description, '') AS description,
    issue.updated_at,
    project.key || '-' || issue.number::text AS issue_key,
    to_tsvector(
      'simple',
      issue.title || ' ' || coalesce(issue.description, '')
    ) AS search_vector,
    CASE lower(btrim(state.name))
      WHEN 'backlog' THEN 'NEW'
      WHEN 'new' THEN 'NEW'
      WHEN 'todo' THEN 'TODO'
      WHEN 'hold' THEN 'HOLD'
      WHEN 'in progress' THEN 'IN_PROGRESS'
      WHEN 'testing' THEN 'TESTING'
      WHEN 'done' THEN 'DONE'
      WHEN 'rejected' THEN 'REJECT'
      WHEN 'canceled' THEN 'REJECT'
      WHEN 'cancelled' THEN 'REJECT'
      ELSE CASE state.category
        WHEN 'BACKLOG' THEN 'NEW'
        WHEN 'UNSTARTED' THEN 'TODO'
        WHEN 'STARTED' THEN 'IN_PROGRESS'
        WHEN 'COMPLETED' THEN 'DONE'
        WHEN 'CANCELED' THEN 'REJECT'
      END
    END AS api_status
  FROM issues AS issue
  JOIN projects AS project
    ON project.id = issue.project_id
   AND project.workspace_id = issue.workspace_id
  JOIN workflow_states AS state
    ON state.id = issue.state_id
   AND state.workspace_id = issue.workspace_id
   AND state.workflow_id = issue.workflow_id
  JOIN workspace_members AS member
    ON member.workspace_id = issue.workspace_id
   AND member.user_id = $1
  WHERE issue.archived_at IS NULL
    AND project.archived_at IS NULL
    AND state.archived_at IS NULL
    AND ($4::text IS NULL OR project.key = $4)
),
matched AS (
  SELECT
    scoped.*,
    CASE
      WHEN $2 = '' THEN 0
      ELSE
        CASE
          WHEN lower(scoped.issue_key) = lower($2) THEN 100
          WHEN lower(scoped.issue_key) LIKE lower($2) || '%' THEN 50
          ELSE 0
        END
        + ts_rank_cd(
            scoped.search_vector,
            websearch_to_tsquery('simple', $2)
          )
        + greatest(
            similarity(scoped.title, $2),
            similarity(scoped.description, $2)
          )
    END AS relevance
  FROM scoped
  WHERE
    (cardinality($5::text[]) = 0 OR scoped.api_status = ANY($5::text[]))
    AND (
      $2 = ''
      OR scoped.issue_key ILIKE ('%' || $3 || '%') ESCAPE E'\\\\'
      OR scoped.title ILIKE ('%' || $3 || '%') ESCAPE E'\\\\'
      OR scoped.description ILIKE ('%' || $3 || '%') ESCAPE E'\\\\'
      OR scoped.search_vector @@ websearch_to_tsquery('simple', $2)
      OR scoped.title % $2
      OR scoped.description % $2
    )
)
SELECT id
FROM matched
ORDER BY relevance DESC, updated_at DESC, id
LIMIT $6
`;

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function findIssueCandidateIDs(
  pool: IssueSearchPool,
  input: IssueSearchInput
) {
  const query = input.query.trim();
  const result = await pool.query<{ id: string }>(issueSearchSQL, [
    input.userID,
    query,
    escapeLikePattern(query),
    input.projectKey?.trim().toUpperCase() || null,
    input.statuses,
    input.limit,
  ]);
  return result.rows.map((row) => row.id);
}
