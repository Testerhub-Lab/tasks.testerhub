import {
  boolean,
  createSchema,
  enumeration,
  number,
  relationships,
  string,
  table,
} from "@rocicorp/zero";

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export type WorkflowCategory =
  | "BACKLOG"
  | "UNSTARTED"
  | "STARTED"
  | "COMPLETED"
  | "CANCELED";
export type IssuePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IssueParticipantRole = "ASSIGNEE" | "WATCHER";

const user = table("user")
  .from("users")
  .columns({
    id: string(),
    displayName: string().from("display_name").optional(),
    avatarURL: string().from("avatar_url").optional(),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("id");

const workspace = table("workspace")
  .from("workspaces")
  .columns({
    id: string(),
    name: string(),
    slug: string(),
    createdByID: string().from("created_by_id"),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
    archivedAt: number().from("archived_at").optional(),
  })
  .primaryKey("id");

const workspaceMember = table("workspaceMember")
  .from("workspace_members")
  .columns({
    workspaceID: string().from("workspace_id"),
    userID: string().from("user_id"),
    role: enumeration<WorkspaceRole>(),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("workspaceID", "userID");

const workflow = table("workflow")
  .from("workflows")
  .columns({
    id: string(),
    workspaceID: string().from("workspace_id"),
    name: string(),
    isDefault: boolean().from("is_default"),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
    archivedAt: number().from("archived_at").optional(),
  })
  .primaryKey("id");

const workflowState = table("workflowState")
  .from("workflow_states")
  .columns({
    id: string(),
    workspaceID: string().from("workspace_id"),
    workflowID: string().from("workflow_id"),
    name: string(),
    category: enumeration<WorkflowCategory>(),
    color: string().optional(),
    rank: string(),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
    archivedAt: number().from("archived_at").optional(),
  })
  .primaryKey("id");

const project = table("project")
  .from("projects")
  .columns({
    id: string(),
    workspaceID: string().from("workspace_id"),
    workflowID: string().from("workflow_id"),
    key: string(),
    name: string(),
    description: string().optional(),
    nextIssueNumber: number().from("next_issue_number"),
    createdByID: string().from("created_by_id"),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
    archivedAt: number().from("archived_at").optional(),
  })
  .primaryKey("id");

const issue = table("issue")
  .from("issues")
  .columns({
    id: string(),
    workspaceID: string().from("workspace_id"),
    projectID: string().from("project_id"),
    workflowID: string().from("workflow_id"),
    stateID: string().from("state_id"),
    number: number(),
    title: string(),
    description: string().optional(),
    priority: enumeration<IssuePriority>(),
    rank: string(),
    creatorID: string().from("creator_id"),
    reporterID: string().from("reporter_id"),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
    archivedAt: number().from("archived_at").optional(),
  })
  .primaryKey("id");

const comment = table("comment")
  .from("comments")
  .columns({
    id: string(),
    workspaceID: string().from("workspace_id"),
    issueID: string().from("issue_id"),
    authorID: string().from("author_id"),
    body: string(),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
    archivedAt: number().from("archived_at").optional(),
  })
  .primaryKey("id");

const tag = table("tag")
  .from("tags")
  .columns({
    id: string(),
    workspaceID: string().from("workspace_id"),
    name: string(),
    color: string().optional(),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
    archivedAt: number().from("archived_at").optional(),
  })
  .primaryKey("id");

const issueTag = table("issueTag")
  .from("issue_tags")
  .columns({
    workspaceID: string().from("workspace_id"),
    issueID: string().from("issue_id"),
    tagID: string().from("tag_id"),
    createdByID: string().from("created_by_id"),
    createdAt: number().from("created_at"),
  })
  .primaryKey("issueID", "tagID");

const issueParticipant = table("issueParticipant")
  .from("issue_participants")
  .columns({
    workspaceID: string().from("workspace_id"),
    issueID: string().from("issue_id"),
    userID: string().from("user_id"),
    role: enumeration<IssueParticipantRole>(),
    createdByID: string().from("created_by_id"),
    createdAt: number().from("created_at"),
  })
  .primaryKey("issueID", "userID", "role");

const attachment = table("attachment")
  .from("attachments")
  .columns({
    id: string(),
    workspaceID: string().from("workspace_id"),
    issueID: string().from("issue_id"),
    objectKey: string().from("object_key"),
    fileName: string().from("file_name"),
    contentType: string().from("content_type"),
    sizeBytes: number().from("size_bytes"),
    uploadedByID: string().from("uploaded_by_id"),
    createdAt: number().from("created_at"),
    archivedAt: number().from("archived_at").optional(),
  })
  .primaryKey("id");

const userRelationships = relationships(user, ({ many }) => ({
  workspaceMemberships: many({
    sourceField: ["id"],
    destField: ["userID"],
    destSchema: workspaceMember,
  }),
}));

const workspaceRelationships = relationships(workspace, ({ many, one }) => ({
  creator: one({
    sourceField: ["createdByID"],
    destField: ["id"],
    destSchema: user,
  }),
  members: many({
    sourceField: ["id"],
    destField: ["workspaceID"],
    destSchema: workspaceMember,
  }),
  users: many(
    {
      sourceField: ["id"],
      destField: ["workspaceID"],
      destSchema: workspaceMember,
    },
    {
      sourceField: ["userID"],
      destField: ["id"],
      destSchema: user,
    }
  ),
  workflows: many({
    sourceField: ["id"],
    destField: ["workspaceID"],
    destSchema: workflow,
  }),
  projects: many({
    sourceField: ["id"],
    destField: ["workspaceID"],
    destSchema: project,
  }),
  tags: many({
    sourceField: ["id"],
    destField: ["workspaceID"],
    destSchema: tag,
  }),
}));

const workspaceMemberRelationships = relationships(
  workspaceMember,
  ({ one }) => ({
    workspace: one({
      sourceField: ["workspaceID"],
      destField: ["id"],
      destSchema: workspace,
    }),
    user: one({
      sourceField: ["userID"],
      destField: ["id"],
      destSchema: user,
    }),
  })
);

const workflowRelationships = relationships(workflow, ({ many, one }) => ({
  workspace: one({
    sourceField: ["workspaceID"],
    destField: ["id"],
    destSchema: workspace,
  }),
  members: many({
    sourceField: ["workspaceID"],
    destField: ["workspaceID"],
    destSchema: workspaceMember,
  }),
  states: many({
    sourceField: ["id"],
    destField: ["workflowID"],
    destSchema: workflowState,
  }),
}));

const workflowStateRelationships = relationships(
  workflowState,
  ({ many, one }) => ({
    workflow: one({
      sourceField: ["workflowID"],
      destField: ["id"],
      destSchema: workflow,
    }),
    members: many({
      sourceField: ["workspaceID"],
      destField: ["workspaceID"],
      destSchema: workspaceMember,
    }),
  })
);

const projectRelationships = relationships(project, ({ many, one }) => ({
  workflow: one({
    sourceField: ["workflowID"],
    destField: ["id"],
    destSchema: workflow,
  }),
  members: many({
    sourceField: ["workspaceID"],
    destField: ["workspaceID"],
    destSchema: workspaceMember,
  }),
  issues: many({
    sourceField: ["id"],
    destField: ["projectID"],
    destSchema: issue,
  }),
}));

const issueRelationships = relationships(issue, ({ many, one }) => ({
  project: one({
    sourceField: ["projectID"],
    destField: ["id"],
    destSchema: project,
  }),
  state: one({
    sourceField: ["stateID"],
    destField: ["id"],
    destSchema: workflowState,
  }),
  members: many({
    sourceField: ["workspaceID"],
    destField: ["workspaceID"],
    destSchema: workspaceMember,
  }),
  comments: many({
    sourceField: ["id"],
    destField: ["issueID"],
    destSchema: comment,
  }),
  attachments: many({
    sourceField: ["id"],
    destField: ["issueID"],
    destSchema: attachment,
  }),
  participants: many({
    sourceField: ["id"],
    destField: ["issueID"],
    destSchema: issueParticipant,
  }),
  tagLinks: many({
    sourceField: ["id"],
    destField: ["issueID"],
    destSchema: issueTag,
  }),
  tags: many(
    {
      sourceField: ["id"],
      destField: ["issueID"],
      destSchema: issueTag,
    },
    {
      sourceField: ["tagID"],
      destField: ["id"],
      destSchema: tag,
    }
  ),
}));

const commentRelationships = relationships(comment, ({ many, one }) => ({
  issue: one({
    sourceField: ["issueID"],
    destField: ["id"],
    destSchema: issue,
  }),
  author: one({
    sourceField: ["authorID"],
    destField: ["id"],
    destSchema: user,
  }),
  members: many({
    sourceField: ["workspaceID"],
    destField: ["workspaceID"],
    destSchema: workspaceMember,
  }),
}));

const tagRelationships = relationships(tag, ({ many }) => ({
  members: many({
    sourceField: ["workspaceID"],
    destField: ["workspaceID"],
    destSchema: workspaceMember,
  }),
  issueLinks: many({
    sourceField: ["id"],
    destField: ["tagID"],
    destSchema: issueTag,
  }),
}));

const issueTagRelationships = relationships(issueTag, ({ many, one }) => ({
  issue: one({
    sourceField: ["issueID"],
    destField: ["id"],
    destSchema: issue,
  }),
  tag: one({
    sourceField: ["tagID"],
    destField: ["id"],
    destSchema: tag,
  }),
  members: many({
    sourceField: ["workspaceID"],
    destField: ["workspaceID"],
    destSchema: workspaceMember,
  }),
}));

const issueParticipantRelationships = relationships(
  issueParticipant,
  ({ many, one }) => ({
    issue: one({
      sourceField: ["issueID"],
      destField: ["id"],
      destSchema: issue,
    }),
    user: one({
      sourceField: ["userID"],
      destField: ["id"],
      destSchema: user,
    }),
    members: many({
      sourceField: ["workspaceID"],
      destField: ["workspaceID"],
      destSchema: workspaceMember,
    }),
  })
);

const attachmentRelationships = relationships(
  attachment,
  ({ many, one }) => ({
    issue: one({
      sourceField: ["issueID"],
      destField: ["id"],
      destSchema: issue,
    }),
    uploader: one({
      sourceField: ["uploadedByID"],
      destField: ["id"],
      destSchema: user,
    }),
    members: many({
      sourceField: ["workspaceID"],
      destField: ["workspaceID"],
      destSchema: workspaceMember,
    }),
  })
);

export const zeroSchema = createSchema({
  tables: [
    user,
    workspace,
    workspaceMember,
    workflow,
    workflowState,
    project,
    issue,
    comment,
    tag,
    issueTag,
    issueParticipant,
    attachment,
  ],
  relationships: [
    userRelationships,
    workspaceRelationships,
    workspaceMemberRelationships,
    workflowRelationships,
    workflowStateRelationships,
    projectRelationships,
    issueRelationships,
    commentRelationships,
    tagRelationships,
    issueTagRelationships,
    issueParticipantRelationships,
    attachmentRelationships,
  ],
  enableLegacyQueries: false,
  enableLegacyMutators: false,
});

export type ZeroSchema = typeof zeroSchema;

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    schema: ZeroSchema;
  }
}
