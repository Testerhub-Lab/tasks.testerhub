import type { Transaction } from "@rocicorp/zero";
import { describe, expect, it, vi } from "vitest";
import { zeroMutators } from "./mutators";
import { DEFAULT_WORKFLOW_STATES } from "./stage3";
import type { ZeroSchema } from "./schema";

const userA = "00000000-0000-7000-8000-000000000001";
const userB = "00000000-0000-7000-8000-000000000002";
const workspaceA = "00000000-0000-7000-8000-000000000010";
const workspaceB = "00000000-0000-7000-8000-000000000011";
const workflowID = "00000000-0000-7000-8000-000000000020";
const stateID = "00000000-0000-7000-8000-000000000021";
const projectID = "00000000-0000-7000-8000-000000000030";
const issueID = "00000000-0000-7000-8000-000000000040";
const tagID = "00000000-0000-7000-8000-000000000050";

function makeTransaction(runResults: unknown[]) {
  const results = [...runResults];
  const spies = {
    audit: vi.fn().mockResolvedValue([]),
    projectUpdate: vi.fn(),
    issueInsert: vi.fn(),
    issueUpdate: vi.fn(),
    commentInsert: vi.fn(),
    memberUpdate: vi.fn(),
    issueTagInsert: vi.fn(),
    userInsert: vi.fn(),
    workspaceInsert: vi.fn(),
    memberInsert: vi.fn(),
    workflowInsert: vi.fn(),
    workflowStateInsert: vi.fn(),
  };
  const tx = {
    location: "server",
    reason: "authoritative",
    clientID: "permission-test",
    mutationID: 1,
    run: vi.fn(async () => results.shift()),
    mutate: {
      project: { update: spies.projectUpdate },
      issue: { insert: spies.issueInsert, update: spies.issueUpdate },
      comment: { insert: spies.commentInsert },
      user: { insert: spies.userInsert },
      workspace: { insert: spies.workspaceInsert },
      workspaceMember: {
        insert: spies.memberInsert,
        update: spies.memberUpdate,
      },
      workflow: { insert: spies.workflowInsert },
      workflowState: { insert: spies.workflowStateInsert },
      issueTag: { insert: spies.issueTagInsert },
    },
    dbTransaction: {
      query: spies.audit,
      runQuery: vi.fn(),
      wrappedTransaction: {},
    },
  } as unknown as Transaction<ZeroSchema>;

  return { spies, tx };
}

const project = {
  id: projectID,
  workspaceID: workspaceA,
  workflowID,
  nextIssueNumber: 1,
};
const issue = {
  id: issueID,
  workspaceID: workspaceA,
  projectID,
  workflowID,
};

describe("Zero mutation authorization negative cases", () => {
  it("rejects issue creation outside the caller workspace", async () => {
    const { spies, tx } = makeTransaction([project, undefined]);

    await expect(
      zeroMutators.issues.create.fn({
        args: {
          id: issueID,
          projectID,
          stateID,
          title: "Foreign issue",
          priority: "HIGH",
          rank: "a0",
        },
        ctx: { userID: userB },
        tx,
      })
    ).rejects.toThrow("Workspace access denied");

    expect(spies.projectUpdate).not.toHaveBeenCalled();
    expect(spies.issueInsert).not.toHaveBeenCalled();
    expect(spies.audit).not.toHaveBeenCalled();
  });

  it("rejects issue updates outside the caller workspace", async () => {
    const { spies, tx } = makeTransaction([issue, undefined]);

    await expect(
      zeroMutators.issues.update.fn({
        args: { id: issueID, title: "Not allowed" },
        ctx: { userID: userB },
        tx,
      })
    ).rejects.toThrow("Workspace access denied");

    expect(spies.issueUpdate).not.toHaveBeenCalled();
    expect(spies.audit).not.toHaveBeenCalled();
  });

  it("keeps workspace viewers read-only", async () => {
    const { spies, tx } = makeTransaction([
      issue,
      { workspaceID: workspaceA, userID: userA, role: "VIEWER" },
    ]);

    await expect(
      zeroMutators.comments.create.fn({
        args: {
          id: "00000000-0000-7000-8000-000000000041",
          issueID,
          body: "Viewer write",
        },
        ctx: { userID: userA },
        tx,
      })
    ).rejects.toThrow("Workspace access denied");

    expect(spies.commentInsert).not.toHaveBeenCalled();
  });

  it("prevents members from changing workspace roles", async () => {
    const { spies, tx } = makeTransaction([
      { workspaceID: workspaceA, userID: userA, role: "MEMBER" },
    ]);

    await expect(
      zeroMutators.workspaceMembers.setRole.fn({
        args: { workspaceID: workspaceA, userID: userB, role: "VIEWER" },
        ctx: { userID: userA },
        tx,
      })
    ).rejects.toThrow("Workspace access denied");

    expect(spies.memberUpdate).not.toHaveBeenCalled();
  });

  it("prevents an admin from granting admin", async () => {
    const { spies, tx } = makeTransaction([
      { workspaceID: workspaceA, userID: userA, role: "ADMIN" },
      { workspaceID: workspaceA, userID: userB, role: "MEMBER" },
    ]);

    await expect(
      zeroMutators.workspaceMembers.setRole.fn({
        args: { workspaceID: workspaceA, userID: userB, role: "ADMIN" },
        ctx: { userID: userA },
        tx,
      })
    ).rejects.toThrow("Only the workspace owner can grant admin");

    expect(spies.memberUpdate).not.toHaveBeenCalled();
    expect(spies.audit).not.toHaveBeenCalled();
  });

  it("rejects a tag from another workspace", async () => {
    const { spies, tx } = makeTransaction([
      issue,
      { workspaceID: workspaceA, userID: userA, role: "MEMBER" },
      { id: tagID, workspaceID: workspaceB, archivedAt: null },
    ]);

    await expect(
      zeroMutators.tags.attach.fn({
        args: { issueID, tagID },
        ctx: { userID: userA },
        tx,
      })
    ).rejects.toThrow("Tag access denied");

    expect(spies.issueTagInsert).not.toHaveBeenCalled();
  });
});

describe("Zero mutation authorization allowed case", () => {
  it("creates the default workflow states atomically with a workspace", async () => {
    const { spies, tx } = makeTransaction([undefined]);
    const states = DEFAULT_WORKFLOW_STATES.map((state, index) => ({
      ...state,
      id: `00000000-0000-7000-8000-00000000010${index}`,
    }));

    await zeroMutators.workspaces.create.fn({
      args: {
        id: workspaceA,
        name: "Stage 3",
        slug: "stage-3",
        displayName: "Stage 3 Owner",
        workflowID,
        workflowName: "Default",
        workflowStates: states,
      },
      ctx: { userID: userA },
      tx,
    });

    expect(spies.userInsert).toHaveBeenCalledOnce();
    expect(spies.workspaceInsert).toHaveBeenCalledOnce();
    expect(spies.memberInsert).toHaveBeenCalledWith(
      expect.objectContaining({ role: "OWNER", userID: userA })
    );
    expect(spies.workflowInsert).toHaveBeenCalledOnce();
    expect(spies.workflowStateInsert).toHaveBeenCalledTimes(states.length);
    expect(spies.workflowStateInsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        category: "BACKLOG",
        rank: DEFAULT_WORKFLOW_STATES[0].rank,
      })
    );
  });

  it("lets the owner change a member role and records the audit event", async () => {
    const { spies, tx } = makeTransaction([
      { workspaceID: workspaceA, userID: userA, role: "OWNER" },
      { workspaceID: workspaceA, userID: userB, role: "MEMBER" },
    ]);

    await zeroMutators.workspaceMembers.setRole.fn({
      args: { workspaceID: workspaceA, userID: userB, role: "ADMIN" },
      ctx: { userID: userA },
      tx,
    });

    expect(spies.memberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceID: workspaceA,
        userID: userB,
        role: "ADMIN",
      })
    );
    expect(spies.audit).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_events"),
      expect.arrayContaining([
        workspaceA,
        userA,
        "workspace_member.role_changed",
      ])
    );
  });
});
