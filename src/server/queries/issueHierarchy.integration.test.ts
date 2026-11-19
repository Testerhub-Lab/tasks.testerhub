import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getZeroDatabase, getZeroPool } from "../../zero/db";
import { createApiIssue, createApiProject } from "../api/zero-domain";
import { registerZeroPasswordUser } from "../auth/zero-store";
import { findEpicCandidates, getIssueHierarchy, IssueParentError, setZeroIssueParent } from "./issueHierarchy";

describe.skipIf(!process.env.ISSUE_HIERARCHY_TEST_DATABASE_URL)("issue hierarchy in PostgreSQL", () => {
  let user: { id: string; name: string; email: null };
  let workspaceId: string;
  let projectId: string;
  const key = "H" + randomUUID().slice(0, 8).toUpperCase();
  const otherKey = "O" + key.slice(1);
  const create = (type: string, title: string, parentId?: string, projectKey = key) =>
    createApiIssue(user, { projectKey, type, title, status: "TODO", priority: "LOW", tags: [], parentId });
  const attach = (parentId: string, childId: string) => getZeroDatabase().transaction(tx =>
    setZeroIssueParent(tx, { projectId, childId, parentId, existing: true }));

  beforeAll(async () => {
    vi.stubEnv("ZERO_UPSTREAM_DB", process.env.ISSUE_HIERARCHY_TEST_DATABASE_URL!);
    vi.stubEnv("PULSAR_AUTH_STORE", "zero");
    const owner = await registerZeroPasswordUser({
      email: key.toLowerCase() + "@example.test", displayName: "Hierarchy test", passwordHash: "test-only",
    });
    user = { id: owner.id, name: "Hierarchy test", email: null };
    workspaceId = (await getZeroPool().query("SELECT workspace_id FROM workspace_members WHERE user_id = $1", [user.id])).rows[0].workspace_id;
    for (const projectKey of [key, otherKey]) {
      const project = await createApiProject(user, { workspaceId, key: projectKey, name: projectKey });
      if (projectKey === key) projectId = project.id;
    }
  });

  afterAll(async () => {
    try {
      if (workspaceId) await getZeroPool().query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
      if (user) await getZeroPool().query("DELETE FROM users WHERE id = $1", [user.id]);
    } finally {
      await getZeroPool().end();
      vi.unstubAllEnvs();
    }
  });

  it("creates children, adds an existing issue once and traverses both directions", async () => {
    const epic = await create("EPIC", "Release");
    const existing = await create("BUG", "First fix");
    const task = await create("TASK", "New task", epic.id);
    const subtask = await create("TASK", "Subtask", task.id);
    expect(await findEpicCandidates(projectId, existing.key)).toMatchObject([{ id: existing.id }]);
    await attach(epic.id, existing.id);
    await attach(epic.id, existing.id);
    const tree = await getIssueHierarchy({ projectId, id: epic.id, parentId: null });
    expect(tree.children.map(child => child.key)).toEqual([existing.key, task.key]);
    expect(tree.children[0]).toMatchObject({ title: existing.title, type: "BUG", status: "TODO" });
    expect(await getIssueHierarchy({ projectId, id: task.id, parentId: epic.id })).toMatchObject({
      parent: { key: epic.key }, children: [{ key: subtask.key }],
    });
    expect(await findEpicCandidates(projectId, existing.title)).toEqual([]);
  });

  it("rejects cross-project links, implicit moves and invalid parents without leaving an orphan", async () => {
    const epic = await create("EPIC", "Milestone");
    const other = await create("EPIC", "Another milestone");
    const task = await create("TASK", "Already assigned", epic.id);
    const foreign = await create("TASK", "Foreign task", undefined, otherKey);
    await expect(attach(other.id, task.id)).rejects.toThrow(IssueParentError);
    await expect(attach(epic.id, foreign.id)).rejects.toThrow(IssueParentError);
    await expect(attach(epic.id, other.id)).rejects.toThrow(IssueParentError);
    await expect(create("TASK", "Invalid child", foreign.id)).rejects.toThrow(IssueParentError);
    expect(await findEpicCandidates(projectId, "Invalid child")).toEqual([]);
    expect(await findEpicCandidates(projectId, "Foreign task")).toEqual([]);
  });
});
