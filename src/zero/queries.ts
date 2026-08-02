import { createBuilder, defineQueries, defineQuery } from "@rocicorp/zero";
import { z } from "zod";
import { zeroSchema } from "./schema";
import type { ZeroContext } from "./context";

const zql = createBuilder(zeroSchema);
const workspaceArgs = z.object({ workspaceID: z.string().uuid() });
const workflowArgs = z.object({ workflowID: z.string().uuid() });
const projectArgs = z.object({ projectID: z.string().uuid() });
const issueArgs = z.object({ issueID: z.string().uuid() });
const issueIDsArgs = z.object({
  issueIDs: z.array(z.string().uuid()).min(1).max(100),
});
const wikiPageArgs = z.object({ pageID: z.string().uuid() });

export const zeroQueries = defineQueries({
  workspaces: {
    mine: defineQuery(({ ctx }: { ctx: ZeroContext }) =>
      zql.workspace
        .where("archivedAt", "IS", null)
        .whereExists("members", (member) =>
          member.where("userID", ctx.userID)
        )
        .orderBy("name", "asc")
    ),
  },
  members: {
    byWorkspace: defineQuery(
      workspaceArgs,
      ({ args, ctx }: { args: z.infer<typeof workspaceArgs>; ctx: ZeroContext }) =>
        zql.workspaceMember
          .where("workspaceID", args.workspaceID)
          .whereExists("workspace", (workspace) =>
            workspace.whereExists("members", (member) =>
              member.where("userID", ctx.userID)
            )
          )
          .related("user")
          .orderBy("createdAt", "asc")
    ),
  },
  workflows: {
    byWorkspace: defineQuery(
      workspaceArgs,
      ({ args, ctx }: { args: z.infer<typeof workspaceArgs>; ctx: ZeroContext }) =>
        zql.workflow
          .where("workspaceID", args.workspaceID)
          .where("archivedAt", "IS", null)
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .orderBy("name", "asc")
    ),
  },
  workflowStates: {
    byWorkflow: defineQuery(
      workflowArgs,
      ({ args, ctx }: { args: z.infer<typeof workflowArgs>; ctx: ZeroContext }) =>
        zql.workflowState
          .where("workflowID", args.workflowID)
          .where("archivedAt", "IS", null)
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .orderBy("rank", "asc")
    ),
  },
  projects: {
    byWorkspace: defineQuery(
      workspaceArgs,
      ({ args, ctx }: { args: z.infer<typeof workspaceArgs>; ctx: ZeroContext }) =>
        zql.project
          .where("workspaceID", args.workspaceID)
          .where("archivedAt", "IS", null)
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .orderBy("name", "asc")
    ),
  },
  issueViewPreferences: {
    byWorkspace: defineQuery(
      workspaceArgs,
      ({ args, ctx }: { args: z.infer<typeof workspaceArgs>; ctx: ZeroContext }) =>
        zql.issueViewPreference
          .where("workspaceID", args.workspaceID)
          .where("userID", ctx.userID)
          .whereExists("workspace", (workspace) =>
            workspace.whereExists("members", (member) =>
              member.where("userID", ctx.userID)
            )
          )
          .orderBy("updatedAt", "desc")
    ),
  },
  issues: {
    byProject: defineQuery(
      projectArgs,
      ({ args, ctx }: { args: z.infer<typeof projectArgs>; ctx: ZeroContext }) =>
        zql.issue
          .where("projectID", args.projectID)
          .where("archivedAt", "IS", null)
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .related("creator")
          .related("reporter")
          .related("state")
          .related("tags")
          .related("participants", (participant) =>
            participant.related("user")
          )
          .orderBy("rank", "asc")
    ),
    byID: defineQuery(
      issueArgs,
      ({ args, ctx }: { args: z.infer<typeof issueArgs>; ctx: ZeroContext }) =>
        zql.issue
          .where("id", args.issueID)
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .related("project")
          .related("creator")
          .related("reporter")
          .related("state")
          .related("tags")
          .related("participants", (participant) =>
            participant.related("user")
          )
          .one()
    ),
    byIDs: defineQuery(
      issueIDsArgs,
      ({ args, ctx }: { args: z.infer<typeof issueIDsArgs>; ctx: ZeroContext }) =>
        zql.issue
          .where("id", "IN", args.issueIDs)
          .where("archivedAt", "IS", null)
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .related("project")
          .related("creator")
          .related("reporter")
          .related("state")
          .related("tags")
          .related("participants", (participant) =>
            participant.related("user")
          )
    ),
  },
  comments: {
    byIssue: defineQuery(
      issueArgs,
      ({ args, ctx }: { args: z.infer<typeof issueArgs>; ctx: ZeroContext }) =>
        zql.comment
          .where("issueID", args.issueID)
          .where("archivedAt", "IS", null)
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .related("author")
          .orderBy("createdAt", "asc")
    ),
  },
  wikiPages: {
    byProject: defineQuery(
      projectArgs,
      ({ args, ctx }: { args: z.infer<typeof projectArgs>; ctx: ZeroContext }) =>
        zql.wikiPage
          .where("projectID", args.projectID)
          .where("archivedAt", "IS", null)
          .whereExists("project", (project) =>
            project.where("knowledgeProvider", "NATIVE")
          )
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .related("updater")
          .orderBy("sortOrder", "asc")
          .orderBy("title", "asc")
    ),
    byID: defineQuery(
      wikiPageArgs,
      ({ args, ctx }: { args: z.infer<typeof wikiPageArgs>; ctx: ZeroContext }) =>
        zql.wikiPage
          .where("id", args.pageID)
          .where("archivedAt", "IS", null)
          .whereExists("project", (project) =>
            project.where("knowledgeProvider", "NATIVE")
          )
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .related("project")
          .related("creator")
          .related("updater")
          .one()
    ),
  },
  wikiPageRevisions: {
    byPage: defineQuery(
      wikiPageArgs,
      ({ args, ctx }: { args: z.infer<typeof wikiPageArgs>; ctx: ZeroContext }) =>
        zql.wikiPageRevision
          .where("pageID", args.pageID)
          .whereExists("page", (page) =>
            page
              .where("archivedAt", "IS", null)
              .whereExists("project", (project) =>
                project.where("knowledgeProvider", "NATIVE")
              )
          )
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .related("creator")
          .orderBy("version", "desc")
    ),
  },
  issueWikiLinks: {
    byIssue: defineQuery(
      issueArgs,
      ({ args, ctx }: { args: z.infer<typeof issueArgs>; ctx: ZeroContext }) =>
        zql.issueWikiLink
          .where("issueID", args.issueID)
          .whereExists("page", (page) =>
            page
              .where("archivedAt", "IS", null)
              .whereExists("project", (project) =>
                project.where("knowledgeProvider", "NATIVE")
              )
          )
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .related("page")
          .orderBy("createdAt", "asc")
    ),
  },
  tags: {
    byWorkspace: defineQuery(
      workspaceArgs,
      ({ args, ctx }: { args: z.infer<typeof workspaceArgs>; ctx: ZeroContext }) =>
        zql.tag
          .where("workspaceID", args.workspaceID)
          .where("archivedAt", "IS", null)
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .orderBy("name", "asc")
    ),
  },
  issueTags: {
    byIssue: defineQuery(
      issueArgs,
      ({ args, ctx }: { args: z.infer<typeof issueArgs>; ctx: ZeroContext }) =>
        zql.issueTag
          .where("issueID", args.issueID)
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .related("tag")
          .orderBy("tagID", "asc")
    ),
  },
  participants: {
    byIssue: defineQuery(
      issueArgs,
      ({ args, ctx }: { args: z.infer<typeof issueArgs>; ctx: ZeroContext }) =>
        zql.issueParticipant
          .where("issueID", args.issueID)
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .related("user")
          .orderBy("createdAt", "asc")
    ),
  },
  attachments: {
    byIssue: defineQuery(
      issueArgs,
      ({ args, ctx }: { args: z.infer<typeof issueArgs>; ctx: ZeroContext }) =>
        zql.attachment
          .where("issueID", args.issueID)
          .where("archivedAt", "IS", null)
          .whereExists("members", (member) =>
            member.where("userID", ctx.userID)
          )
          .related("uploader")
          .orderBy("createdAt", "asc")
    ),
  },
});
