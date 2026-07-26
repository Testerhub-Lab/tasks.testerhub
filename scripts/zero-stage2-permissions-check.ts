import { randomUUID } from "node:crypto";
import type { Query } from "@rocicorp/zero";
import { zeroNodePg } from "@rocicorp/zero/server/adapters/pg";
import { Pool } from "pg";
import { zeroMutators } from "../src/zero/mutators";
import { zeroQueries } from "../src/zero/queries";
import { zeroSchema, type ZeroSchema } from "../src/zero/schema";

const connectionString = process.env.ZERO_UPSTREAM_DB;
if (!connectionString) throw new Error("ZERO_UPSTREAM_DB is required");

const pool = new Pool({ connectionString });
const database = zeroNodePg(zeroSchema, pool);
const userA = randomUUID();
const userB = randomUUID();
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const workflowB = randomUUID();
const stateB = randomUUID();
const projectB = randomUUID();
const issueB = randomUUID();
const originalTitle = "Workspace B issue";

async function seed() {
  await pool.query(
    `INSERT INTO users (id, display_name)
     VALUES ($1, 'User A'), ($2, 'User B')`,
    [userA, userB]
  );
  await pool.query(
    `INSERT INTO workspaces (id, name, slug, created_by_id)
     VALUES
       ($1, 'Workspace A', $2, $3),
       ($4, 'Workspace B', $5, $6)`,
    [
      workspaceA,
      `permission-a-${workspaceA}`,
      userA,
      workspaceB,
      `permission-b-${workspaceB}`,
      userB,
    ]
  );
  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, 'OWNER'), ($3, $4, 'OWNER')`,
    [workspaceA, userA, workspaceB, userB]
  );
  await pool.query(
    `INSERT INTO workflows (id, workspace_id, name, is_default)
     VALUES ($1, $2, 'Default', true)`,
    [workflowB, workspaceB]
  );
  await pool.query(
    `INSERT INTO workflow_states (
       id, workspace_id, workflow_id, name, category, rank
     ) VALUES ($1, $2, $3, 'Todo', 'UNSTARTED', 'a0')`,
    [stateB, workspaceB, workflowB]
  );
  await pool.query(
    `INSERT INTO projects (
       id, workspace_id, workflow_id, key, name, created_by_id
     ) VALUES ($1, $2, $3, 'PERM', 'Permission project', $4)`,
    [projectB, workspaceB, workflowB, userB]
  );
  await pool.query(
    `INSERT INTO issues (
       id, workspace_id, project_id, workflow_id, state_id, number, title,
       priority, rank, creator_id, reporter_id
     ) VALUES ($1, $2, $3, $4, $5, 1, $6, 'MEDIUM', 'a0', $7, $7)`,
    [issueB, workspaceB, projectB, workflowB, stateB, originalTitle, userB]
  );
}

async function checkQueryPermission() {
  const scopedIssues = (userID: string) =>
    zeroQueries.issues.byProject.fn({
      args: { projectID: projectB },
      ctx: { userID },
    }) as Query<"issue", ZeroSchema>;

  const foreignRows = await database.run(
    scopedIssues(userA)
  );
  const ownRows = await database.run(scopedIssues(userB));

  if (foreignRows.length !== 0 || ownRows.length !== 1) {
    throw new Error("Workspace-scoped query permission failed");
  }
}

async function checkMutationPermission() {
  let rejected = false;
  try {
    await database.transaction((tx) =>
      zeroMutators.issues.update.fn({
        args: { id: issueB, title: "Forbidden update" },
        tx,
        ctx: { userID: userA },
      })
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Workspace access denied"
    ) {
      rejected = true;
    } else {
      throw error;
    }
  }
  if (!rejected) {
    throw new Error("Foreign mutation was not rejected");
  }

  const stored = await pool.query<{ title: string }>(
    "SELECT title FROM issues WHERE id = $1",
    [issueB]
  );
  if (stored.rows[0]?.title !== originalTitle) {
    throw new Error("Foreign mutation changed the issue");
  }
}

async function main() {
  try {
    await seed();
    await checkQueryPermission();
    await checkMutationPermission();
    console.info(
      JSON.stringify({
        foreignMutationDenied: true,
        foreignQueryRows: 0,
        ownQueryRows: 1,
        rowUnchanged: true,
      })
    );
  } finally {
    await pool.query("DELETE FROM workspaces WHERE id = ANY($1::uuid[])", [
      [workspaceA, workspaceB],
    ]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
      [userA, userB],
    ]);
    await pool.end();
  }
}

void main();
