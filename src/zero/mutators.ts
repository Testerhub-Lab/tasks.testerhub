import {
  createBuilder,
  defineMutator,
  defineMutators,
  type Transaction,
} from "@rocicorp/zero";
import { z } from "zod";
import {
  assertCanSetMemberRole,
  getWorkspaceRole,
  requireWorkspaceRole,
} from "./authorization";
import {
  zeroSchema,
  type ZeroSchema,
} from "./schema";

const zql = createBuilder(zeroSchema);
const id = z.string().uuid();
const rank = z.string().trim().min(1).max(128);
const color = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional();

async function recordAudit(
  tx: Transaction<ZeroSchema>,
  input: {
    workspaceID: string;
    actorID: string;
    action: string;
    entityType: string;
    entityID: string;
    changes?: Record<string, unknown>;
  }
) {
  if (tx.location !== "server") return;

  await tx.dbTransaction.query(
    `INSERT INTO audit_events (
       id, workspace_id, actor_id, action, entity_type, entity_id, changes
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb
     )`,
    [
      input.workspaceID,
      input.actorID,
      input.action,
      input.entityType,
      input.entityID,
      JSON.stringify(input.changes ?? {}),
    ]
  );
}

async function getProjectForWrite(
  tx: Transaction<ZeroSchema>,
  projectID: string,
  userID: string
) {
  const project = await tx.run(zql.project.where("id", projectID).one());
  if (!project) throw new Error("Project access denied");
  await requireWorkspaceRole(tx, project.workspaceID, userID, "MEMBER");
  return project;
}

async function getIssueForWrite(
  tx: Transaction<ZeroSchema>,
  issueID: string,
  userID: string
) {
  const issue = await tx.run(zql.issue.where("id", issueID).one());
  if (!issue) throw new Error("Issue access denied");
  await requireWorkspaceRole(tx, issue.workspaceID, userID, "MEMBER");
  return issue;
}

async function requireMatchingState(
  tx: Transaction<ZeroSchema>,
  stateID: string,
  workspaceID: string,
  workflowID: string
) {
  const state = await tx.run(zql.workflowState.where("id", stateID).one());
  if (
    !state ||
    state.workspaceID !== workspaceID ||
    state.workflowID !== workflowID ||
    state.archivedAt
  ) {
    throw new Error("Workflow state access denied");
  }
  return state;
}

export const zeroMutators = defineMutators({
  workspaces: {
    create: defineMutator(
      z.object({
        id,
        name: z.string().trim().min(1).max(120),
        slug: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        displayName: z.string().trim().min(1).max(120).optional(),
        workflowID: id,
        workflowName: z.string().trim().min(1).max(80).default("Default"),
      }),
      async ({ args, ctx, tx }) => {
        const now = Date.now();
        const existingUser = await tx.run(
          zql.user.where("id", ctx.userID).one()
        );
        if (!existingUser) {
          await tx.mutate.user.insert({
            id: ctx.userID,
            displayName: args.displayName,
            createdAt: now,
            updatedAt: now,
          });
        }

        await tx.mutate.workspace.insert({
          id: args.id,
          name: args.name,
          slug: args.slug,
          createdByID: ctx.userID,
          createdAt: now,
          updatedAt: now,
        });
        await tx.mutate.workspaceMember.insert({
          workspaceID: args.id,
          userID: ctx.userID,
          role: "OWNER",
          createdAt: now,
          updatedAt: now,
        });
        await tx.mutate.workflow.insert({
          id: args.workflowID,
          workspaceID: args.id,
          name: args.workflowName,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        });
        await recordAudit(tx, {
          workspaceID: args.id,
          actorID: ctx.userID,
          action: "workspace.created",
          entityType: "workspace",
          entityID: args.id,
        });
      }
    ),
  },
  workspaceMembers: {
    setRole: defineMutator(
      z.object({
        workspaceID: id,
        userID: id,
        role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
      }),
      async ({ args, ctx, tx }) => {
        const callerRole = await requireWorkspaceRole(
          tx,
          args.workspaceID,
          ctx.userID,
          "ADMIN"
        );
        const target = await tx.run(
          zql.workspaceMember
            .where("workspaceID", args.workspaceID)
            .where("userID", args.userID)
            .one()
        );
        if (!target) throw new Error("Workspace member access denied");

        assertCanSetMemberRole(callerRole, target.role, args.role);
        await tx.mutate.workspaceMember.update({
          workspaceID: args.workspaceID,
          userID: args.userID,
          role: args.role,
          updatedAt: Date.now(),
        });
        await recordAudit(tx, {
          workspaceID: args.workspaceID,
          actorID: ctx.userID,
          action: "workspace_member.role_changed",
          entityType: "workspace_member",
          entityID: args.userID,
          changes: { from: target.role, to: args.role },
        });
      }
    ),
  },
  workflowStates: {
    create: defineMutator(
      z.object({
        id,
        workflowID: id,
        name: z.string().trim().min(1).max(80),
        category: z.enum([
          "BACKLOG",
          "UNSTARTED",
          "STARTED",
          "COMPLETED",
          "CANCELED",
        ]),
        color,
        rank,
      }),
      async ({ args, ctx, tx }) => {
        const workflow = await tx.run(
          zql.workflow.where("id", args.workflowID).one()
        );
        if (!workflow) throw new Error("Workflow access denied");
        await requireWorkspaceRole(
          tx,
          workflow.workspaceID,
          ctx.userID,
          "ADMIN"
        );

        const now = Date.now();
        await tx.mutate.workflowState.insert({
          id: args.id,
          workspaceID: workflow.workspaceID,
          workflowID: workflow.id,
          name: args.name,
          category: args.category,
          color: args.color,
          rank: args.rank,
          createdAt: now,
          updatedAt: now,
        });
        await recordAudit(tx, {
          workspaceID: workflow.workspaceID,
          actorID: ctx.userID,
          action: "workflow_state.created",
          entityType: "workflow_state",
          entityID: args.id,
        });
      }
    ),
  },
  projects: {
    create: defineMutator(
      z.object({
        id,
        workspaceID: id,
        workflowID: id,
        key: z.string().trim().regex(/^[A-Z][A-Z0-9]{1,9}$/),
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(20000).nullable().optional(),
      }),
      async ({ args, ctx, tx }) => {
        await requireWorkspaceRole(
          tx,
          args.workspaceID,
          ctx.userID,
          "ADMIN"
        );
        const workflow = await tx.run(
          zql.workflow.where("id", args.workflowID).one()
        );
        if (!workflow || workflow.workspaceID !== args.workspaceID) {
          throw new Error("Workflow access denied");
        }

        const now = Date.now();
        await tx.mutate.project.insert({
          id: args.id,
          workspaceID: args.workspaceID,
          workflowID: args.workflowID,
          key: args.key,
          name: args.name,
          description: args.description,
          nextIssueNumber: 1,
          createdByID: ctx.userID,
          createdAt: now,
          updatedAt: now,
        });
        await recordAudit(tx, {
          workspaceID: args.workspaceID,
          actorID: ctx.userID,
          action: "project.created",
          entityType: "project",
          entityID: args.id,
        });
      }
    ),
  },
  issues: {
    create: defineMutator(
      z.object({
        id,
        projectID: id,
        stateID: id,
        title: z.string().trim().min(1).max(240),
        description: z.string().trim().max(20000).nullable().optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        rank,
      }),
      async ({ args, ctx, tx }) => {
        const project = await getProjectForWrite(tx, args.projectID, ctx.userID);
        await requireMatchingState(
          tx,
          args.stateID,
          project.workspaceID,
          project.workflowID
        );

        const now = Date.now();
        await tx.mutate.project.update({
          id: project.id,
          nextIssueNumber: project.nextIssueNumber + 1,
          updatedAt: now,
        });
        await tx.mutate.issue.insert({
          id: args.id,
          workspaceID: project.workspaceID,
          projectID: project.id,
          workflowID: project.workflowID,
          stateID: args.stateID,
          number: project.nextIssueNumber,
          title: args.title,
          description: args.description,
          priority: args.priority,
          rank: args.rank,
          creatorID: ctx.userID,
          reporterID: ctx.userID,
          createdAt: now,
          updatedAt: now,
        });
        await recordAudit(tx, {
          workspaceID: project.workspaceID,
          actorID: ctx.userID,
          action: "issue.created",
          entityType: "issue",
          entityID: args.id,
        });
      }
    ),
    update: defineMutator(
      z
        .object({
          id,
          title: z.string().trim().min(1).max(240).optional(),
          description: z.string().trim().max(20000).nullable().optional(),
          stateID: id.optional(),
          priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
          rank: rank.optional(),
        })
        .refine(
          (args) =>
            Object.entries(args).some(
              ([key, value]) => key !== "id" && value !== undefined
            ),
          "At least one issue field is required"
        ),
      async ({ args, ctx, tx }) => {
        const issue = await getIssueForWrite(tx, args.id, ctx.userID);
        if (args.stateID) {
          await requireMatchingState(
            tx,
            args.stateID,
            issue.workspaceID,
            issue.workflowID
          );
        }

        const changes = {
          ...(args.title !== undefined ? { title: args.title } : {}),
          ...(args.description !== undefined
            ? { description: args.description }
            : {}),
          ...(args.stateID !== undefined ? { stateID: args.stateID } : {}),
          ...(args.priority !== undefined ? { priority: args.priority } : {}),
          ...(args.rank !== undefined ? { rank: args.rank } : {}),
        };
        await tx.mutate.issue.update({
          id: args.id,
          ...changes,
          updatedAt: Date.now(),
        });
        await recordAudit(tx, {
          workspaceID: issue.workspaceID,
          actorID: ctx.userID,
          action: "issue.updated",
          entityType: "issue",
          entityID: issue.id,
          changes,
        });
      }
    ),
    archive: defineMutator(
      z.object({ id }),
      async ({ args, ctx, tx }) => {
        const issue = await getIssueForWrite(tx, args.id, ctx.userID);
        const now = Date.now();
        await tx.mutate.issue.update({
          id: issue.id,
          archivedAt: now,
          updatedAt: now,
        });
        await recordAudit(tx, {
          workspaceID: issue.workspaceID,
          actorID: ctx.userID,
          action: "issue.archived",
          entityType: "issue",
          entityID: issue.id,
        });
      }
    ),
  },
  comments: {
    create: defineMutator(
      z.object({
        id,
        issueID: id,
        body: z.string().trim().min(1).max(20000),
      }),
      async ({ args, ctx, tx }) => {
        const issue = await getIssueForWrite(tx, args.issueID, ctx.userID);
        const now = Date.now();
        await tx.mutate.comment.insert({
          id: args.id,
          workspaceID: issue.workspaceID,
          issueID: issue.id,
          authorID: ctx.userID,
          body: args.body,
          createdAt: now,
          updatedAt: now,
        });
      }
    ),
  },
  tags: {
    create: defineMutator(
      z.object({
        id,
        workspaceID: id,
        name: z.string().trim().min(1).max(60),
        color,
      }),
      async ({ args, ctx, tx }) => {
        await requireWorkspaceRole(
          tx,
          args.workspaceID,
          ctx.userID,
          "MEMBER"
        );
        const now = Date.now();
        await tx.mutate.tag.insert({
          id: args.id,
          workspaceID: args.workspaceID,
          name: args.name,
          color: args.color,
          createdAt: now,
          updatedAt: now,
        });
      }
    ),
    attach: defineMutator(
      z.object({ issueID: id, tagID: id }),
      async ({ args, ctx, tx }) => {
        const issue = await getIssueForWrite(tx, args.issueID, ctx.userID);
        const tag = await tx.run(zql.tag.where("id", args.tagID).one());
        if (!tag || tag.workspaceID !== issue.workspaceID || tag.archivedAt) {
          throw new Error("Tag access denied");
        }

        await tx.mutate.issueTag.insert({
          workspaceID: issue.workspaceID,
          issueID: issue.id,
          tagID: tag.id,
          createdByID: ctx.userID,
          createdAt: Date.now(),
        });
      }
    ),
  },
  participants: {
    add: defineMutator(
      z.object({
        issueID: id,
        userID: id,
        role: z.enum(["ASSIGNEE", "WATCHER"]),
      }),
      async ({ args, ctx, tx }) => {
        const issue = await getIssueForWrite(tx, args.issueID, ctx.userID);
        const participantRole = await getWorkspaceRole(
          tx,
          issue.workspaceID,
          args.userID
        );
        if (!participantRole) {
          throw new Error("Participant access denied");
        }

        await tx.mutate.issueParticipant.insert({
          workspaceID: issue.workspaceID,
          issueID: issue.id,
          userID: args.userID,
          role: args.role,
          createdByID: ctx.userID,
          createdAt: Date.now(),
        });
      }
    ),
  },
  attachments: {
    register: defineMutator(
      z.object({
        id,
        issueID: id,
        objectKey: z.string().trim().min(1).max(1024),
        fileName: z.string().trim().min(1).max(255),
        contentType: z.string().trim().min(1).max(255),
        sizeBytes: z.number().int().min(1).max(2147483647),
      }),
      async ({ args, ctx, tx }) => {
        const issue = await getIssueForWrite(tx, args.issueID, ctx.userID);
        await tx.mutate.attachment.insert({
          id: args.id,
          workspaceID: issue.workspaceID,
          issueID: issue.id,
          objectKey: args.objectKey,
          fileName: args.fileName,
          contentType: args.contentType,
          sizeBytes: args.sizeBytes,
          uploadedByID: ctx.userID,
          createdAt: Date.now(),
        });
      }
    ),
  },
});
