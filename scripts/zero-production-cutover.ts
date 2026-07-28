import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { hashPassword } from "../src/server/auth/password";
import { DEFAULT_WORKFLOW_STATES } from "../src/zero/stage3";

type LegacyUser = {
  id: string;
  email: string;
  name: string | null;
};

type LegacyWorkspace = {
  id: string;
  name: string;
  slug: string;
  personalOwnerId: string | null;
  createdAt: Date;
};

type LegacyWorkspaceMember = {
  workspaceId: string;
  userId: string;
  role: "ADMIN" | "MEMBER";
  createdAt: Date;
};

type LegacyProject = {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  nextIssueNumber: number;
  createdAt: Date;
  archivedAt: Date | null;
  knowledgeProvider: "DISABLED" | "NATIVE" | "EXTERNAL";
  knowledgeExternalUrl: string | null;
};

type LegacyTask = {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  type: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status:
    | "NEW"
    | "TODO"
    | "HOLD"
    | "IN_PROGRESS"
    | "TESTING"
    | "DONE"
    | "REJECT";
  creatorId: string | null;
  reporterId: string | null;
  assigneeId: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  dueDate: Date | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
};

type LegacyComment = {
  id: string;
  taskId: string;
  text: string;
  userId: string | null;
  authorName: string | null;
  createdAt: Date;
};

type LegacyWikiPage = {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  slug: string;
  contentMarkdown: string;
  sortOrder: number;
  version: number;
  createdById: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

type LegacyWikiRevision = {
  id: string;
  pageId: string;
  version: number;
  title: string;
  contentMarkdown: string;
  createdById: string | null;
  createdAt: Date;
};

type LegacyKnowledgeLink = {
  id: string;
  taskId: string;
  projectId: string;
  provider: "DISABLED" | "NATIVE" | "EXTERNAL";
  documentKey: string;
  title: string;
  createdById: string | null;
  createdAt: Date;
};

type LegacyApiToken = {
  id: string;
  userId: string;
  name: string;
  tokenPrefix: string;
  tokenHash: string;
  scopes: string[];
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

type LegacyApiAuditLog = {
  userId: string | null;
  apiTokenId: string | null;
  projectId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  requestId: string | null;
  metadata: unknown;
  createdAt: Date;
};

type SourceSnapshot = {
  users: LegacyUser[];
  workspaces: LegacyWorkspace[];
  workspaceMembers: LegacyWorkspaceMember[];
  projects: LegacyProject[];
  tasks: LegacyTask[];
  comments: LegacyComment[];
  wikiPages: LegacyWikiPage[];
  wikiRevisions: LegacyWikiRevision[];
  knowledgeLinks: LegacyKnowledgeLink[];
  apiTokens: LegacyApiToken[];
  apiAuditLogs: LegacyApiAuditLog[];
};

const legacyDatabaseURL = process.env.CUTOVER_LEGACY_DATABASE_URL;
const targetDatabaseURL = process.env.ZERO_UPSTREAM_DB;
const adminEmail = process.env.CUTOVER_ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.CUTOVER_ADMIN_PASSWORD;
const dryRun = process.env.CUTOVER_DRY_RUN === "true";

if (!legacyDatabaseURL) {
  throw new Error("CUTOVER_LEGACY_DATABASE_URL is required");
}
if (!targetDatabaseURL) throw new Error("ZERO_UPSTREAM_DB is required");
if (!adminEmail) throw new Error("CUTOVER_ADMIN_EMAIL is required");
if (!adminPassword || adminPassword.length < 16) {
  throw new Error("CUTOVER_ADMIN_PASSWORD must contain at least 16 characters");
}
const cutoverAdminPassword = adminPassword;
if (!dryRun && process.env.CUTOVER_CONFIRM !== "production") {
  throw new Error("CUTOVER_CONFIRM=production is required");
}
if (legacyDatabaseURL === targetDatabaseURL) {
  throw new Error("Legacy and target database URLs must differ");
}

function mappedID(map: Map<string, string>, sourceID: string) {
  const existing = map.get(sourceID);
  if (existing) return existing;
  const created = randomUUID();
  map.set(sourceID, created);
  return created;
}

function requiredMappedID(
  map: Map<string, string>,
  sourceID: string,
  label: string
) {
  const value = map.get(sourceID);
  if (!value) throw new Error(`${label} mapping is missing for ${sourceID}`);
  return value;
}

function issueDescription(task: LegacyTask) {
  const extras = [
    task.requesterName ? `Заказчик: ${task.requesterName}` : "",
    task.requesterEmail ? `Email заказчика: ${task.requesterEmail}` : "",
    task.dueDate ? `Срок: ${task.dueDate.toISOString()}` : "",
  ].filter(Boolean);
  if (extras.length === 0) return task.description;
  return [task.description?.trim(), ...extras].filter(Boolean).join("\n\n");
}

function stateName(status: LegacyTask["status"]) {
  return {
    NEW: "Backlog",
    TODO: "Todo",
    HOLD: "Hold",
    IN_PROGRESS: "In progress",
    TESTING: "Testing",
    DONE: "Done",
    REJECT: "Rejected",
  }[status];
}

function orderedWikiPages(pages: LegacyWikiPage[]) {
  const remaining = new Map(pages.map((page) => [page.id, page]));
  const ordered: LegacyWikiPage[] = [];
  while (remaining.size > 0) {
    let progressed = false;
    for (const [id, page] of remaining) {
      if (!page.parentId || !remaining.has(page.parentId)) {
        ordered.push(page);
        remaining.delete(id);
        progressed = true;
      }
    }
    if (!progressed) throw new Error("Legacy Wiki contains a parent cycle");
  }
  return ordered;
}

async function sourceSnapshot(source: Pool): Promise<SourceSnapshot> {
  const [
    users,
    workspaces,
    workspaceMembers,
    projects,
    tasks,
    comments,
    wikiPages,
    wikiRevisions,
    knowledgeLinks,
    apiTokens,
    apiAuditLogs,
  ] = await Promise.all([
    source.query<LegacyUser>(
      `SELECT id, email, name FROM "User" ORDER BY email, id`
    ),
    source.query<LegacyWorkspace>(
      `SELECT id, name, slug, "personalOwnerId", "createdAt"
       FROM "Workspace" AS workspace
       WHERE
         EXISTS (
           SELECT 1 FROM "WorkspaceMember"
           WHERE "workspaceId" = workspace.id
         )
         OR EXISTS (
           SELECT 1 FROM "Project"
           WHERE "workspaceId" = workspace.id
         )
       ORDER BY "createdAt", id`
    ),
    source.query<LegacyWorkspaceMember>(
      `SELECT "workspaceId", "userId", role::text, "createdAt"
       FROM "WorkspaceMember"
       ORDER BY "createdAt", id`
    ),
    source.query<LegacyProject>(
      `SELECT
         project.id,
         project."workspaceId",
         project.key,
         project.name,
         project."nextIssueNumber",
         project."createdAt",
         project."archivedAt",
         coalesce(knowledge.provider::text, 'DISABLED') AS "knowledgeProvider",
         knowledge."externalUrl" AS "knowledgeExternalUrl"
       FROM "Project" AS project
       LEFT JOIN "ProjectKnowledge" AS knowledge
         ON knowledge."projectId" = project.id
       ORDER BY project."createdAt", project.id`
    ),
    source.query<LegacyTask>(
      `SELECT
         id,
         "projectId",
         number,
         title,
         description,
         type,
         priority::text,
         status::text,
         "creatorId",
         "reporterId",
         "assigneeId",
         "requesterName",
         "requesterEmail",
         "dueDate",
         tags,
         "createdAt",
         "updatedAt",
         "isDeleted",
         "deletedAt"
       FROM "Task"
       ORDER BY "createdAt", id`
    ),
    source.query<LegacyComment>(
      `SELECT id, "taskId", text, "userId", "authorName", "createdAt"
       FROM "Comment"
       ORDER BY "createdAt", id`
    ),
    source.query<LegacyWikiPage>(
      `SELECT
         id,
         "projectId",
         "parentId",
         title,
         slug,
         "contentMarkdown",
         "sortOrder",
         version,
         "createdById",
         "updatedById",
         "createdAt",
         "updatedAt",
         "archivedAt"
       FROM "WikiPage"
       ORDER BY "createdAt", id`
    ),
    source.query<LegacyWikiRevision>(
      `SELECT
         id,
         "pageId",
         version,
         title,
         "contentMarkdown",
         "createdById",
         "createdAt"
       FROM "WikiPageRevision"
       ORDER BY "pageId", version`
    ),
    source.query<LegacyKnowledgeLink>(
      `SELECT
         id,
         "taskId",
         "projectId",
         provider::text,
         "documentKey",
         title,
         "createdById",
         "createdAt"
       FROM "KnowledgeLink"
       ORDER BY "createdAt", id`
    ),
    source.query<LegacyApiToken>(
      `SELECT
         id,
         "userId",
         name,
         "tokenPrefix",
         "tokenHash",
         scopes,
         "createdAt",
         "expiresAt",
         "lastUsedAt",
         "revokedAt"
       FROM "ApiToken"
       ORDER BY "createdAt", id`
    ),
    source.query<LegacyApiAuditLog>(
      `SELECT
         "userId",
         "apiTokenId",
         "projectId",
         action,
         "resourceType",
         "resourceId",
         "requestId",
         metadata,
         "createdAt"
       FROM "ApiAuditLog"
       ORDER BY "createdAt", id`
    ),
  ]);
  return {
    users: users.rows,
    workspaces: workspaces.rows,
    workspaceMembers: workspaceMembers.rows,
    projects: projects.rows,
    tasks: tasks.rows,
    comments: comments.rows,
    wikiPages: wikiPages.rows,
    wikiRevisions: wikiRevisions.rows,
    knowledgeLinks: knowledgeLinks.rows,
    apiTokens: apiTokens.rows,
    apiAuditLogs: apiAuditLogs.rows,
  };
}

async function assertEmptyTarget(client: PoolClient) {
  const result = await client.query<{
    users: string;
    workspaces: string;
    projects: string;
    issues: string;
    wiki_pages: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM users) AS users,
       (SELECT count(*)::text FROM workspaces) AS workspaces,
       (SELECT count(*)::text FROM projects) AS projects,
       (SELECT count(*)::text FROM issues) AS issues,
       (SELECT count(*)::text FROM wiki_pages) AS wiki_pages`
  );
  const counts = result.rows[0];
  if (
    !counts ||
    Object.values(counts).some((value) => Number(value) !== 0)
  ) {
    throw new Error(`Target is not empty: ${JSON.stringify(counts)}`);
  }
}

async function importSnapshot(
  client: PoolClient,
  snapshot: SourceSnapshot,
  passwordHash: string
) {
  const admin = snapshot.users.find(
    (user) => user.email.trim().toLowerCase() === adminEmail
  );
  if (!admin) throw new Error(`Admin ${adminEmail} is absent from legacy DB`);

  const userIDs = new Map<string, string>();
  const workspaceIDs = new Map<string, string>();
  const workflowIDs = new Map<string, string>();
  const stateIDs = new Map<string, string>();
  const projectIDs = new Map<string, string>();
  const issueIDs = new Map<string, string>();
  const wikiPageIDs = new Map<string, string>();
  const apiTokenIDs = new Map<string, string>();

  for (const user of snapshot.users) {
    await client.query(
      `INSERT INTO users (id, display_name)
       VALUES ($1, $2)`,
      [mappedID(userIDs, user.id), user.name]
    );
  }
  const adminID = requiredMappedID(userIDs, admin.id, "admin user");
  await client.query(
    `INSERT INTO auth_identities (
       id, user_id, provider, provider_subject, password_hash
     ) VALUES ($1, $2, 'password', $3, $4)`,
    [randomUUID(), adminID, adminEmail, passwordHash]
  );

  for (const workspace of snapshot.workspaces) {
    const workspaceID = mappedID(workspaceIDs, workspace.id);
    const creatorID =
      (workspace.personalOwnerId &&
        userIDs.get(workspace.personalOwnerId)) ||
      adminID;
    await client.query(
      `INSERT INTO workspaces (
         id, name, slug, created_by_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $5)`,
      [
        workspaceID,
        workspace.name,
        `${workspace.slug.replace(/[^a-z0-9-]/g, "-").slice(0, 65)}-${workspaceID
          .replace(/-/g, "")
          .slice(0, 8)}`,
        creatorID,
        workspace.createdAt,
      ]
    );
    const workflowID = mappedID(workflowIDs, workspace.id);
    await client.query(
      `INSERT INTO workflows (
         id, workspace_id, name, is_default, created_at, updated_at
       ) VALUES ($1, $2, 'Default', true, $3, $3)`,
      [workflowID, workspaceID, workspace.createdAt]
    );
    for (const state of DEFAULT_WORKFLOW_STATES) {
      const stateID = randomUUID();
      stateIDs.set(`${workspace.id}:${state.name}`, stateID);
      await client.query(
        `INSERT INTO workflow_states (
           id, workspace_id, workflow_id, name, category, color, rank,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
        [
          stateID,
          workspaceID,
          workflowID,
          state.name,
          state.category,
          state.color,
          state.rank,
          workspace.createdAt,
        ]
      );
    }
  }

  for (const membership of snapshot.workspaceMembers) {
    const workspaceID = workspaceIDs.get(membership.workspaceId);
    const userID = userIDs.get(membership.userId);
    if (!workspaceID || !userID) continue;
    const role =
      membership.userId === admin.id && membership.role === "ADMIN"
        ? "OWNER"
        : membership.role;
    await client.query(
      `INSERT INTO workspace_members (
         workspace_id, user_id, role, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [workspaceID, userID, role, membership.createdAt]
    );
  }

  for (const project of snapshot.projects) {
    const workspaceID = requiredMappedID(
      workspaceIDs,
      project.workspaceId,
      "workspace"
    );
    const workflowID = requiredMappedID(
      workflowIDs,
      project.workspaceId,
      "workflow"
    );
    await client.query(
      `INSERT INTO projects (
         id, workspace_id, workflow_id, key, name,
         knowledge_provider, knowledge_external_url, next_issue_number,
         created_by_id, created_at, updated_at, archived_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11
       )`,
      [
        mappedID(projectIDs, project.id),
        workspaceID,
        workflowID,
        project.key,
        project.name,
        project.knowledgeProvider,
        project.knowledgeProvider === "EXTERNAL"
          ? project.knowledgeExternalUrl
          : null,
        project.nextIssueNumber,
        adminID,
        project.createdAt,
        project.archivedAt,
      ]
    );
  }

  const tagIDs = new Map<string, string>();
  for (const task of snapshot.tasks) {
    const project = snapshot.projects.find(
      (candidate) => candidate.id === task.projectId
    );
    if (!project) throw new Error(`Project missing for task ${task.id}`);
    const workspaceID = requiredMappedID(
      workspaceIDs,
      project.workspaceId,
      "workspace"
    );
    const workflowID = requiredMappedID(
      workflowIDs,
      project.workspaceId,
      "workflow"
    );
    const stateID = stateIDs.get(
      `${project.workspaceId}:${stateName(task.status)}`
    );
    if (!stateID) throw new Error(`State missing for ${task.status}`);
    const issueID = mappedID(issueIDs, task.id);
    const creatorID =
      (task.creatorId && userIDs.get(task.creatorId)) || adminID;
    const reporterID =
      (task.reporterId && userIDs.get(task.reporterId)) || creatorID;
    await client.query(
      `INSERT INTO issues (
         id, workspace_id, project_id, workflow_id, state_id, number,
         title, description, type, priority, rank, creator_id, reporter_id,
         created_at, updated_at, archived_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
       )`,
      [
        issueID,
        workspaceID,
        requiredMappedID(projectIDs, task.projectId, "project"),
        workflowID,
        stateID,
        task.number,
        task.title,
        issueDescription(task),
        task.type,
        task.priority,
        String(task.number).padStart(20, "0"),
        creatorID,
        reporterID,
        task.createdAt,
        task.updatedAt,
        task.isDeleted ? task.deletedAt ?? task.updatedAt : null,
      ]
    );
    if (task.assigneeId && userIDs.has(task.assigneeId)) {
      await client.query(
        `INSERT INTO issue_participants (
           workspace_id, issue_id, user_id, role, created_by_id, created_at
         ) VALUES ($1, $2, $3, 'ASSIGNEE', $4, $5)`,
        [
          workspaceID,
          issueID,
          requiredMappedID(userIDs, task.assigneeId, "assignee"),
          creatorID,
          task.createdAt,
        ]
      );
    }
    for (const rawTag of task.tags) {
      const tag = rawTag.trim().toLowerCase();
      if (!tag) continue;
      const tagKey = `${workspaceID}:${tag}`;
      let tagID = tagIDs.get(tagKey);
      if (!tagID) {
        tagID = randomUUID();
        tagIDs.set(tagKey, tagID);
        await client.query(
          `INSERT INTO tags (
             id, workspace_id, name, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $4)`,
          [tagID, workspaceID, tag, task.createdAt]
        );
      }
      await client.query(
        `INSERT INTO issue_tags (
           workspace_id, issue_id, tag_id, created_by_id, created_at
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (issue_id, tag_id) DO NOTHING`,
        [workspaceID, issueID, tagID, creatorID, task.createdAt]
      );
    }
  }

  for (const comment of snapshot.comments) {
    const task = snapshot.tasks.find(
      (candidate) => candidate.id === comment.taskId
    );
    const project = task
      ? snapshot.projects.find(
          (candidate) => candidate.id === task.projectId
        )
      : null;
    if (!task || !project) continue;
    const authorID =
      (comment.userId && userIDs.get(comment.userId)) || adminID;
    const body = comment.authorName
      ? `${comment.text}\n\n— ${comment.authorName}`
      : comment.text;
    await client.query(
      `INSERT INTO comments (
         id, workspace_id, issue_id, author_id, body, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $6)`,
      [
        randomUUID(),
        requiredMappedID(
          workspaceIDs,
          project.workspaceId,
          "workspace"
        ),
        requiredMappedID(issueIDs, comment.taskId, "issue"),
        authorID,
        body,
        comment.createdAt,
      ]
    );
  }

  for (const page of orderedWikiPages(snapshot.wikiPages)) {
    const project = snapshot.projects.find(
      (candidate) => candidate.id === page.projectId
    );
    if (!project) throw new Error(`Project missing for Wiki page ${page.id}`);
    await client.query(
      `INSERT INTO wiki_pages (
         id, workspace_id, project_id, parent_id, title, slug,
         content_markdown, sort_order, version, created_by_id, updated_by_id,
         created_at, updated_at, archived_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
       )`,
      [
        mappedID(wikiPageIDs, page.id),
        requiredMappedID(
          workspaceIDs,
          project.workspaceId,
          "workspace"
        ),
        requiredMappedID(projectIDs, page.projectId, "project"),
        page.parentId
          ? requiredMappedID(wikiPageIDs, page.parentId, "Wiki parent")
          : null,
        page.title,
        page.slug,
        page.contentMarkdown,
        page.sortOrder,
        page.version,
        (page.createdById && userIDs.get(page.createdById)) || adminID,
        (page.updatedById && userIDs.get(page.updatedById)) || adminID,
        page.createdAt,
        page.updatedAt,
        page.archivedAt,
      ]
    );
  }

  for (const revision of snapshot.wikiRevisions) {
    const page = snapshot.wikiPages.find(
      (candidate) => candidate.id === revision.pageId
    );
    const project = page
      ? snapshot.projects.find(
          (candidate) => candidate.id === page.projectId
        )
      : null;
    if (!page || !project) continue;
    await client.query(
      `INSERT INTO wiki_page_revisions (
         id, workspace_id, project_id, page_id, version, title,
         content_markdown, created_by_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        requiredMappedID(
          workspaceIDs,
          project.workspaceId,
          "workspace"
        ),
        requiredMappedID(projectIDs, project.id, "project"),
        requiredMappedID(wikiPageIDs, page.id, "Wiki page"),
        revision.version,
        revision.title,
        revision.contentMarkdown,
        (revision.createdById && userIDs.get(revision.createdById)) ||
          adminID,
        revision.createdAt,
      ]
    );
  }

  for (const link of snapshot.knowledgeLinks) {
    if (link.provider !== "NATIVE") continue;
    const issueID = issueIDs.get(link.taskId);
    const pageID = wikiPageIDs.get(link.documentKey);
    const projectID = projectIDs.get(link.projectId);
    const project = snapshot.projects.find(
      (candidate) => candidate.id === link.projectId
    );
    if (!issueID || !pageID || !projectID || !project) continue;
    await client.query(
      `INSERT INTO issue_wiki_links (
         id, workspace_id, project_id, issue_id, page_id,
         created_by_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (issue_id, page_id) DO NOTHING`,
      [
        randomUUID(),
        requiredMappedID(
          workspaceIDs,
          project.workspaceId,
          "workspace"
        ),
        projectID,
        issueID,
        pageID,
        (link.createdById && userIDs.get(link.createdById)) || adminID,
        link.createdAt,
      ]
    );
  }

  for (const token of snapshot.apiTokens) {
    const userID = userIDs.get(token.userId);
    if (!userID) continue;
    const tokenID = mappedID(apiTokenIDs, token.id);
    await client.query(
      `INSERT INTO api_tokens (
         id, user_id, name, token_prefix, token_hash, scopes,
         created_at, expires_at, last_used_at, revoked_at
       ) VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10)`,
      [
        tokenID,
        userID,
        token.name,
        token.tokenPrefix,
        token.tokenHash,
        token.scopes,
        token.createdAt,
        token.expiresAt,
        token.lastUsedAt,
        token.revokedAt,
      ]
    );
  }

  for (const log of snapshot.apiAuditLogs) {
    await client.query(
      `INSERT INTO api_audit_logs (
         id, user_id, api_token_id, action, resource_type, resource_id,
         request_id, metadata, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        randomUUID(),
        log.userId ? userIDs.get(log.userId) ?? null : null,
        log.apiTokenId ? apiTokenIDs.get(log.apiTokenId) ?? null : null,
        log.action,
        log.resourceType,
        log.resourceId,
        log.requestId,
        JSON.stringify({
          ...(log.metadata && typeof log.metadata === "object"
            ? log.metadata
            : { sourceMetadata: log.metadata }),
          ...(log.projectId ? { sourceProjectID: log.projectId } : {}),
        }),
        log.createdAt,
      ]
    );
  }

  const mainWorkspace = snapshot.projects[0]?.workspaceId;
  const auditWorkspace = mainWorkspace ?? snapshot.workspaces[0]?.id;
  if (!auditWorkspace) throw new Error("No workspace available for audit");
  await client.query(
    `INSERT INTO audit_events (
       id, workspace_id, actor_id, action, entity_type, entity_id, changes
     ) VALUES ($1, $2, $3, 'cutover.legacy_imported', 'workspace', $2, $4::jsonb)`,
    [
      randomUUID(),
      requiredMappedID(workspaceIDs, auditWorkspace, "workspace"),
      adminID,
      JSON.stringify({
        source: "legacy-postgresql-14",
        users: snapshot.users.length,
        workspaces: snapshot.workspaces.length,
        projects: snapshot.projects.length,
        issues: snapshot.tasks.length,
        comments: snapshot.comments.length,
        wikiPages: snapshot.wikiPages.length,
        wikiRevisions: snapshot.wikiRevisions.length,
        apiTokens: snapshot.apiTokens.length,
      }),
    ]
  );

  return {
    adminID,
    counts: {
      users: snapshot.users.length,
      workspaces: snapshot.workspaces.length,
      projects: snapshot.projects.length,
      issues: snapshot.tasks.length,
      comments: snapshot.comments.length,
      wikiPages: snapshot.wikiPages.length,
      wikiRevisions: snapshot.wikiRevisions.length,
      wikiLinks: snapshot.knowledgeLinks.filter(
        (link) => link.provider === "NATIVE"
      ).length,
      apiTokens: snapshot.apiTokens.length,
    },
  };
}

async function verifyTarget(
  client: PoolClient,
  expected: Awaited<ReturnType<typeof importSnapshot>>["counts"]
) {
  const result = await client.query<Record<keyof typeof expected, string>>(
    `SELECT
       (SELECT count(*)::text FROM users) AS users,
       (SELECT count(*)::text FROM workspaces) AS workspaces,
       (SELECT count(*)::text FROM projects) AS projects,
       (SELECT count(*)::text FROM issues) AS issues,
       (SELECT count(*)::text FROM comments) AS comments,
       (SELECT count(*)::text FROM wiki_pages) AS "wikiPages",
       (SELECT count(*)::text FROM wiki_page_revisions) AS "wikiRevisions",
       (SELECT count(*)::text FROM issue_wiki_links) AS "wikiLinks",
       (SELECT count(*)::text FROM api_tokens) AS "apiTokens"`
  );
  const actual = Object.fromEntries(
    Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)])
  );
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(
        `Target count mismatch for ${key}: expected ${value}, got ${actual[key]}`
      );
    }
  }
  return actual;
}

async function main() {
  const source = new Pool({ connectionString: legacyDatabaseURL, max: 4 });
  const target = new Pool({ connectionString: targetDatabaseURL, max: 2 });
  const client = await target.connect();
  try {
    const snapshot = await sourceSnapshot(source);
    const passwordHash = await hashPassword(cutoverAdminPassword);
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '2min'");
    await assertEmptyTarget(client);
    const imported = await importSnapshot(client, snapshot, passwordHash);
    const verified = await verifyTarget(client, imported.counts);
    if (dryRun) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
    console.log(
      JSON.stringify({
        ok: true,
        mode: dryRun ? "dry-run" : "production",
        adminEmail,
        adminID: imported.adminID,
        counts: verified,
      })
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await Promise.all([source.end(), target.end()]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
