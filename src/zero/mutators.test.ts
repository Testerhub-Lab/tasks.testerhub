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
const pageID = "00000000-0000-7000-8000-000000000060";
const revisionID = "00000000-0000-7000-8000-000000000061";

function makeTransaction(runResults: unknown[]) {
  const results = [...runResults];
  const spies = {
    audit: vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE projects")) return [{ issue_number: 1 }];
      if (sql.includes("SELECT version")) return [{ version: 2 }];
      return [];
    }),
    projectUpdate: vi.fn(),
    issueInsert: vi.fn(),
    issueUpdate: vi.fn(),
    commentInsert: vi.fn(),
    memberUpdate: vi.fn(),
    issueTagInsert: vi.fn(),
    issueTagDelete: vi.fn(),
    tagInsert: vi.fn(),
    userInsert: vi.fn(),
    workspaceInsert: vi.fn(),
    memberInsert: vi.fn(),
    workflowInsert: vi.fn(),
    workflowStateInsert: vi.fn(),
    wikiPageInsert: vi.fn(),
    wikiPageUpdate: vi.fn(),
    wikiRevisionInsert: vi.fn(),
    issueWikiLinkInsert: vi.fn(),
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
      wikiPage: {
        insert: spies.wikiPageInsert,
        update: spies.wikiPageUpdate,
      },
      wikiPageRevision: { insert: spies.wikiRevisionInsert },
      issueWikiLink: { insert: spies.issueWikiLinkInsert },
      tag: { insert: spies.tagInsert },
      issueTag: {
        insert: spies.issueTagInsert,
        delete: spies.issueTagDelete,
      },
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
  knowledgeProvider: "NATIVE",
  nextIssueNumber: 1,
};
const issue = {
  id: issueID,
  workspaceID: workspaceA,
  projectID,
  workflowID,
};
const page = {
  id: pageID,
  workspaceID: workspaceA,
  projectID,
  title: "Architecture",
  slug: "architecture",
  contentMarkdown: "Current",
  version: 1,
  archivedAt: null,
};

describe("Zero mutation authorization negative cases", () => {
  it("does not expose object-key registration as a public Zero mutator", () => {
    expect("attachments" in zeroMutators).toBe(false);
  });

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

  it("rejects tag replacement by a workspace viewer", async () => {
    const { spies, tx } = makeTransaction([
      issue,
      { workspaceID: workspaceA, userID: userA, role: "VIEWER" },
    ]);

    await expect(
      zeroMutators.issues.setTags.fn({
        args: {
          id: issueID,
          tags: [{ id: tagID, name: "security" }],
        },
        ctx: { userID: userA },
        tx,
      })
    ).rejects.toThrow("Workspace access denied");

    expect(spies.tagInsert).not.toHaveBeenCalled();
    expect(spies.issueTagInsert).not.toHaveBeenCalled();
    expect(spies.issueTagDelete).not.toHaveBeenCalled();
  });

  it("keeps workspace viewers from creating Wiki pages", async () => {
    const { spies, tx } = makeTransaction([
      project,
      { workspaceID: workspaceA, userID: userA, role: "VIEWER" },
    ]);

    await expect(
      zeroMutators.wikiPages.create.fn({
        args: {
          id: pageID,
          revisionID,
          projectID,
          title: "Viewer page",
          contentMarkdown: "",
        },
        ctx: { userID: userA },
        tx,
      })
    ).rejects.toThrow("Workspace access denied");

    expect(spies.wikiPageInsert).not.toHaveBeenCalled();
    expect(spies.wikiRevisionInsert).not.toHaveBeenCalled();
  });

  it("rejects links to a Wiki page from another project", async () => {
    const foreignPage = {
      ...page,
      projectID: "00000000-0000-7000-8000-000000000031",
    };
    const { spies, tx } = makeTransaction([
      issue,
      { workspaceID: workspaceA, userID: userA, role: "MEMBER" },
      project,
      foreignPage,
    ]);

    await expect(
      zeroMutators.issueWikiLinks.create.fn({
        args: { id: revisionID, issueID, pageID },
        ctx: { userID: userA },
        tx,
      })
    ).rejects.toThrow("Wiki page access denied");

    expect(spies.issueWikiLinkInsert).not.toHaveBeenCalled();
  });

  it("rejects stale expected Wiki versions before changing the page", async () => {
    const { spies, tx } = makeTransaction([
      page,
      { workspaceID: workspaceA, userID: userA, role: "MEMBER" },
      project,
    ]);

    await expect(
      zeroMutators.wikiPages.update.fn({
        args: {
          id: pageID,
          revisionID,
          title: "Stale title",
          expectedVersion: 1,
        },
        ctx: { userID: userA },
        tx,
      })
    ).rejects.toThrow("Wiki version conflict:2");

    expect(spies.wikiPageUpdate).not.toHaveBeenCalled();
    expect(spies.wikiRevisionInsert).not.toHaveBeenCalled();
  });
});

describe("Zero mutation authorization allowed case", () => {
  it("allocates an issue number authoritatively and keeps the public type", async () => {
    const { spies, tx } = makeTransaction([
      project,
      { workspaceID: workspaceA, userID: userA, role: "MEMBER" },
      {
        id: stateID,
        workspaceID: workspaceA,
        workflowID,
        archivedAt: null,
      },
    ]);

    await zeroMutators.issues.create.fn({
      args: {
        id: issueID,
        projectID,
        stateID,
        title: "REST and Zero",
        priority: "HIGH",
        rank: "a0",
      },
      ctx: { userID: userA },
      tx,
    });

    expect(spies.issueInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        number: 1,
        type: "TASK",
      })
    );
    expect(spies.projectUpdate).not.toHaveBeenCalled();
    expect(spies.audit).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE projects"),
      [projectID]
    );
  });

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

  it("normalizes and replaces issue tags through the authorized command", async () => {
    const oldTagID = "00000000-0000-7000-8000-000000000051";
    const { spies, tx } = makeTransaction([
      issue,
      { workspaceID: workspaceA, userID: userA, role: "MEMBER" },
      [{ issueID, tagID: oldTagID }],
      [{ id: tagID, workspaceID: workspaceA, name: "Security" }],
    ]);

    await zeroMutators.issues.setTags.fn({
      args: {
        id: issueID,
        tags: [{ id: tagID, name: " Security " }],
      },
      ctx: { userID: userA },
      tx,
    });

    expect(spies.issueTagInsert).toHaveBeenCalledWith(
      expect.objectContaining({ issueID, tagID })
    );
    expect(spies.issueTagDelete).toHaveBeenCalledWith({
      issueID,
      tagID: oldTagID,
    });
    expect(spies.audit).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_events"),
      expect.arrayContaining(["issue.tags_changed"])
    );
  });

  it("deduplicates issue tags case-insensitively", async () => {
    const { spies, tx } = makeTransaction([
      issue,
      { workspaceID: workspaceA, userID: userA, role: "MEMBER" },
      [],
      [{ id: tagID, workspaceID: workspaceA, name: "Security" }],
    ]);

    await zeroMutators.issues.setTags.fn({
      args: {
        id: issueID,
        tags: [
          { id: tagID, name: "security" },
          {
            id: "00000000-0000-7000-8000-000000000052",
            name: " SECURITY ",
          },
        ],
      },
      ctx: { userID: userA },
      tx,
    });

    expect(spies.tagInsert).not.toHaveBeenCalled();
    expect(spies.issueTagInsert).toHaveBeenCalledTimes(1);
    expect(spies.issueTagInsert).toHaveBeenCalledWith(
      expect.objectContaining({ issueID, tagID })
    );
  });

  it("creates a Wiki page and its first revision in one command", async () => {
    const { spies, tx } = makeTransaction([
      project,
      { workspaceID: workspaceA, userID: userA, role: "MEMBER" },
      [],
    ]);

    await zeroMutators.wikiPages.create.fn({
      args: {
        id: pageID,
        revisionID,
        projectID,
        title: "Target Architecture",
        contentMarkdown: "# Target",
      },
      ctx: { userID: userA },
      tx,
    });

    expect(spies.wikiPageInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: pageID,
        slug: "target-architecture",
        sortOrder: 0,
        version: 1,
      })
    );
    expect(spies.wikiRevisionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: revisionID,
        pageID,
        version: 1,
      })
    );
    expect(spies.audit).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_events"),
      expect.arrayContaining(["wiki_page.created"])
    );
  });
});
