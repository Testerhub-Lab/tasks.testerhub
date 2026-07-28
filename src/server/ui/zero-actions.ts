import { randomUUID } from "node:crypto";
import type { Priority, Status } from "@prisma/client";
import { getZeroDatabase, getZeroPool } from "@/zero/db";
import { zeroMutators } from "@/zero/mutators";
import {
  addApiComment,
  createApiIssue,
  updateApiIssue,
} from "@/server/api/zero-domain";
import {
  getZeroTask,
  zeroStateToLegacyStatus,
} from "./zero-legacy";

type ZeroUiActor = {
  id: string;
  email: null;
  name: string | null;
};

type ZeroIssueMutationRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  project_key: string;
  number: number;
  creator_id: string;
  archived_at: Date | null;
  state_name: string;
  state_category:
    | "BACKLOG"
    | "UNSTARTED"
    | "STARTED"
    | "COMPLETED"
    | "CANCELED";
};

function actor(user: { id: string; name: string | null }): ZeroUiActor {
  return { id: user.id, email: null, name: user.name };
}

async function requireZeroIssueForWrite(
  userID: string,
  workspaceID: string,
  issueID: string
) {
  const result = await getZeroPool().query<ZeroIssueMutationRow>(
    `SELECT
       issue.id,
       issue.workspace_id,
       issue.project_id,
       project.key AS project_key,
       issue.number,
       issue.creator_id,
       issue.archived_at,
       state.name AS state_name,
       state.category AS state_category
     FROM issues AS issue
     JOIN projects AS project ON project.id = issue.project_id
     JOIN workflow_states AS state ON state.id = issue.state_id
     JOIN workspace_members AS membership
       ON membership.workspace_id = issue.workspace_id
      AND membership.user_id = $1
     WHERE
       issue.id = $2
       AND issue.workspace_id = $3
       AND membership.role IN ('OWNER', 'ADMIN', 'MEMBER')`,
    [userID, issueID, workspaceID]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Issue access denied");
  return row;
}

async function setZeroIssueAssignee(input: {
  issueID: string;
  workspaceID: string;
  actorID: string;
  assigneeID: string | null;
}) {
  const client = await getZeroPool().connect();
  try {
    await client.query("BEGIN");
    const issue = await client.query<{ workspace_id: string }>(
      `SELECT issue.workspace_id
       FROM issues AS issue
       JOIN workspace_members AS caller
         ON caller.workspace_id = issue.workspace_id
        AND caller.user_id = $2
       WHERE
         issue.id = $1
         AND issue.workspace_id = $3
         AND issue.archived_at IS NULL
         AND caller.role IN ('OWNER', 'ADMIN', 'MEMBER')
       FOR UPDATE OF issue`,
      [input.issueID, input.actorID, input.workspaceID]
    );
    if (!issue.rowCount) throw new Error("Issue access denied");

    if (input.assigneeID) {
      const target = await client.query(
        `SELECT 1
         FROM workspace_members
         WHERE workspace_id = $1 AND user_id = $2`,
        [input.workspaceID, input.assigneeID]
      );
      if (!target.rowCount) throw new Error("Participant access denied");
    }

    await client.query(
      `DELETE FROM issue_participants
       WHERE issue_id = $1 AND role = 'ASSIGNEE'`,
      [input.issueID]
    );
    if (input.assigneeID) {
      await client.query(
        `INSERT INTO issue_participants (
           workspace_id, issue_id, user_id, role, created_by_id
         ) VALUES ($1, $2, $3, 'ASSIGNEE', $4)`,
        [
          input.workspaceID,
          input.issueID,
          input.assigneeID,
          input.actorID,
        ]
      );
    }
    await client.query(
      `INSERT INTO audit_events (
         id, workspace_id, actor_id, action, entity_type, entity_id, changes
       ) VALUES (
         $1, $2, $3, 'issue.assignee_changed', 'issue', $4, $5::jsonb
       )`,
      [
        randomUUID(),
        input.workspaceID,
        input.actorID,
        input.issueID,
        JSON.stringify({ assigneeID: input.assigneeID }),
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createZeroTaskForUI(input: {
  user: { id: string; name: string | null };
  workspaceID: string;
  projectID: string;
  title: string;
  description: string | null;
  type: string;
  priority: Priority;
  tags: string[];
  assigneeID: string | null;
}) {
  const project = await getZeroPool().query<{ key: string }>(
    `SELECT project.key
     FROM projects AS project
     JOIN workspace_members AS membership
       ON membership.workspace_id = project.workspace_id
      AND membership.user_id = $1
     WHERE
       project.id = $2
       AND project.workspace_id = $3
       AND project.archived_at IS NULL
       AND membership.role IN ('OWNER', 'ADMIN', 'MEMBER')`,
    [input.user.id, input.projectID, input.workspaceID]
  );
  const projectKey = project.rows[0]?.key;
  if (!projectKey) throw new Error("Project access denied");

  const created = await createApiIssue(actor(input.user), {
    projectKey,
    title: input.title,
    description: input.description,
    type: input.type,
    priority: input.priority,
    tags: input.tags,
  });
  if (input.assigneeID) {
    await setZeroIssueAssignee({
      issueID: created.id,
      workspaceID: input.workspaceID,
      actorID: input.user.id,
      assigneeID: input.assigneeID,
    });
  }
  const task = await getZeroTask("id", created.id, [input.projectID]);
  if (!task) throw new Error("Created issue was not found");
  return task;
}

export async function updateZeroTaskForUI(input: {
  user: { id: string; name: string | null };
  workspaceID: string;
  issueID: string;
  status?: Status;
  priority?: Priority;
  title?: string;
  description?: string | null;
  assigneeID?: string | null;
}) {
  const issue = await requireZeroIssueForWrite(
    input.user.id,
    input.workspaceID,
    input.issueID
  );
  if (issue.archived_at) throw new Error("Issue is archived");

  const fields = {
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
  };
  if (Object.keys(fields).length > 0) {
    await updateApiIssue(
      actor(input.user),
      `${issue.project_key}-${issue.number}`,
      fields
    );
  }
  if (input.assigneeID !== undefined) {
    await setZeroIssueAssignee({
      issueID: issue.id,
      workspaceID: issue.workspace_id,
      actorID: input.user.id,
      assigneeID: input.assigneeID,
    });
  }

  const task = await getZeroTask("id", issue.id, [issue.project_id]);
  if (!task) throw new Error("Updated issue was not found");
  return {
    task,
    previousStatus: zeroStateToLegacyStatus({
      name: issue.state_name,
      category: issue.state_category,
    }),
  };
}

export async function addZeroCommentForUI(input: {
  user: { id: string; name: string | null };
  workspaceID: string;
  issueID: string;
  text: string;
}) {
  const issue = await requireZeroIssueForWrite(
    input.user.id,
    input.workspaceID,
    input.issueID
  );
  if (issue.archived_at) throw new Error("Issue is archived");
  return addApiComment(
    actor(input.user),
    `${issue.project_key}-${issue.number}`,
    { text: input.text }
  );
}

export async function getZeroTaskDeletionPermission(input: {
  userID: string;
  workspaceID: string;
  issueID: string;
}) {
  const issue = await requireZeroIssueForWrite(
    input.userID,
    input.workspaceID,
    input.issueID
  );
  return {
    id: issue.id,
    key: `${issue.project_key}-${issue.number}`,
    status: zeroStateToLegacyStatus({
      name: issue.state_name,
      category: issue.state_category,
    }),
    projectId: issue.project_id,
    workspaceId: issue.workspace_id,
    creatorId: issue.creator_id,
    isDeleted: Boolean(issue.archived_at),
  };
}

export async function archiveZeroTaskForUI(input: {
  userID: string;
  issueID: string;
}) {
  await getZeroDatabase().transaction(async (tx) => {
    await zeroMutators.issues.archive.fn({
      args: { id: input.issueID },
      ctx: { userID: input.userID },
      tx,
    });
  });
}

export async function restoreZeroTaskForUI(input: {
  userID: string;
  workspaceID: string;
  issueID: string;
  projectID: string;
}) {
  const client = await getZeroPool().connect();
  try {
    await client.query("BEGIN");
    const restored = await client.query(
      `UPDATE issues AS issue
       SET archived_at = NULL, updated_at = now()
       FROM workspace_members AS membership
       WHERE
         issue.id = $1
         AND issue.project_id = $2
         AND issue.workspace_id = $3
         AND membership.workspace_id = issue.workspace_id
         AND membership.user_id = $4
         AND membership.role IN ('OWNER', 'ADMIN', 'MEMBER')
       RETURNING issue.id`,
      [input.issueID, input.projectID, input.workspaceID, input.userID]
    );
    if (!restored.rowCount) throw new Error("Issue access denied");
    await client.query(
      `INSERT INTO audit_events (
         id, workspace_id, actor_id, action, entity_type, entity_id
       ) VALUES ($1, $2, $3, 'issue.restored', 'issue', $4)`,
      [randomUUID(), input.workspaceID, input.userID, input.issueID]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const task = await getZeroTask("id", input.issueID, [input.projectID]);
  if (!task) throw new Error("Restored issue was not found");
  return task;
}
