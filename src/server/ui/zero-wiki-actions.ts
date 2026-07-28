import { randomUUID } from "node:crypto";
import type { KnowledgeProvider } from "@prisma/client";
import {
  createApiWikiPage,
  linkApiIssueToWiki,
  updateApiWikiPage,
} from "@/server/api/zero-wiki-domain";
import { getZeroPool } from "@/zero/db";

type ZeroWikiActor = {
  id: string;
  email: null;
  name: string | null;
};

function actor(user: { id: string; name: string | null }): ZeroWikiActor {
  return { id: user.id, email: null, name: user.name };
}

async function requireZeroWikiProject(input: {
  userID: string;
  projectID: string;
  role: "ADMIN" | "MEMBER";
}) {
  const allowedRoles =
    input.role === "ADMIN"
      ? ["OWNER", "ADMIN"]
      : ["OWNER", "ADMIN", "MEMBER"];
  const result = await getZeroPool().query<{
    id: string;
    key: string;
    workspace_id: string;
    knowledge_provider: KnowledgeProvider;
  }>(
    `SELECT
       project.id,
       project.key,
       project.workspace_id,
       project.knowledge_provider
     FROM projects AS project
     JOIN workspace_members AS membership
       ON membership.workspace_id = project.workspace_id
      AND membership.user_id = $1
     WHERE project.id = $2 AND membership.role = ANY($3::text[])`,
    [input.userID, input.projectID, allowedRoles]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Project access denied");
  return row;
}

export async function updateZeroProjectKnowledge(input: {
  userID: string;
  projectID: string;
  provider: KnowledgeProvider;
  externalURL: string | null;
}) {
  const project = await requireZeroWikiProject({
    userID: input.userID,
    projectID: input.projectID,
    role: "ADMIN",
  });
  await getZeroPool().query(
    `UPDATE projects
     SET
       knowledge_provider = $2,
       knowledge_external_url = $3,
       updated_at = now()
     WHERE id = $1`,
    [
      input.projectID,
      input.provider,
      input.provider === "EXTERNAL" ? input.externalURL : null,
    ]
  );
  return project;
}

export async function createZeroWikiPageForUI(input: {
  user: { id: string; name: string | null };
  projectID: string;
  parentID: string | null;
  title: string;
}) {
  const project = await requireZeroWikiProject({
    userID: input.user.id,
    projectID: input.projectID,
    role: "MEMBER",
  });
  if (project.knowledge_provider !== "NATIVE") {
    throw new Error("Native Wiki is disabled");
  }
  return createApiWikiPage(actor(input.user), project.key, {
    parentId: input.parentID,
    title: input.title,
    contentMarkdown: "",
  });
}

export async function updateZeroWikiPageForUI(input: {
  user: { id: string; name: string | null };
  pageID: string;
  title: string;
  contentMarkdown: string;
}) {
  const page = await getZeroPool().query<{
    project_id: string;
    version: number;
  }>(
    `SELECT project_id, version
     FROM wiki_pages
     WHERE id = $1 AND archived_at IS NULL`,
    [input.pageID]
  );
  const row = page.rows[0];
  if (!row) throw new Error("Wiki page not found");
  const project = await requireZeroWikiProject({
    userID: input.user.id,
    projectID: row.project_id,
    role: "MEMBER",
  });
  if (project.knowledge_provider !== "NATIVE") {
    throw new Error("Native Wiki is disabled");
  }
  return updateApiWikiPage(actor(input.user), input.pageID, {
    title: input.title,
    contentMarkdown: input.contentMarkdown,
    expectedVersion: row.version,
  });
}

export async function setZeroWikiPageArchived(input: {
  userID: string;
  pageID: string;
  archived: boolean;
}) {
  const page = await getZeroPool().query<{
    project_id: string;
    workspace_id: string;
    project_key: string;
  }>(
    `SELECT
       page.project_id,
       page.workspace_id,
       project.key AS project_key
     FROM wiki_pages AS page
     JOIN projects AS project ON project.id = page.project_id
     WHERE page.id = $1`,
    [input.pageID]
  );
  const row = page.rows[0];
  if (!row) throw new Error("Wiki page not found");
  const project = await requireZeroWikiProject({
    userID: input.userID,
    projectID: row.project_id,
    role: "MEMBER",
  });
  if (project.knowledge_provider !== "NATIVE") {
    throw new Error("Native Wiki is disabled");
  }

  const client = await getZeroPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `WITH RECURSIVE affected AS (
         SELECT id FROM wiki_pages WHERE id = $1
         UNION ALL
         SELECT child.id
         FROM wiki_pages AS child
         JOIN affected AS parent ON child.parent_id = parent.id
       )
       UPDATE wiki_pages
       SET archived_at = $2, updated_at = now()
       WHERE id IN (SELECT id FROM affected)`,
      [input.pageID, input.archived ? new Date() : null]
    );
    await client.query(
      `INSERT INTO audit_events (
         id, workspace_id, actor_id, action, entity_type, entity_id, changes
       ) VALUES ($1, $2, $3, $4, 'wiki_page', $5, $6::jsonb)`,
      [
        randomUUID(),
        row.workspace_id,
        input.userID,
        input.archived ? "wiki_page.archived" : "wiki_page.restored",
        input.pageID,
        JSON.stringify({ recursive: true }),
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { projectKey: row.project_key };
}

export async function restoreZeroWikiRevision(input: {
  user: { id: string; name: string | null };
  pageID: string;
  revisionID: string;
}) {
  const result = await getZeroPool().query<{
    title: string;
    content_markdown: string;
    project_id: string;
    version: number;
    project_key: string;
  }>(
    `SELECT
       revision.title,
       revision.content_markdown,
       page.project_id,
       page.version,
       project.key AS project_key
     FROM wiki_page_revisions AS revision
     JOIN wiki_pages AS page ON page.id = revision.page_id
     JOIN projects AS project ON project.id = page.project_id
     WHERE
       revision.id = $1
       AND revision.page_id = $2
       AND page.archived_at IS NULL`,
    [input.revisionID, input.pageID]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Wiki revision not found");
  const project = await requireZeroWikiProject({
    userID: input.user.id,
    projectID: row.project_id,
    role: "MEMBER",
  });
  if (project.knowledge_provider !== "NATIVE") {
    throw new Error("Native Wiki is disabled");
  }
  const restored = await updateApiWikiPage(actor(input.user), input.pageID, {
    title: row.title,
    contentMarkdown: row.content_markdown,
    expectedVersion: row.version,
  });
  return { ...restored, projectKey: row.project_key };
}

export async function addZeroTaskKnowledgeLink(input: {
  user: { id: string; name: string | null };
  taskID: string;
  pageID: string;
}) {
  const issue = await getZeroPool().query<{
    project_id: string;
    project_key: string;
    number: number;
  }>(
    `SELECT
       issue.project_id,
       project.key AS project_key,
       issue.number
     FROM issues AS issue
     JOIN projects AS project ON project.id = issue.project_id
     WHERE issue.id = $1 AND issue.archived_at IS NULL`,
    [input.taskID]
  );
  const row = issue.rows[0];
  if (!row) throw new Error("Issue not found");
  await requireZeroWikiProject({
    userID: input.user.id,
    projectID: row.project_id,
    role: "MEMBER",
  });
  return linkApiIssueToWiki(
    actor(input.user),
    `${row.project_key}-${row.number}`,
    input.pageID
  );
}

export async function removeZeroTaskKnowledgeLink(input: {
  userID: string;
  linkID: string;
}) {
  const result = await getZeroPool().query<{
    project_id: string;
    issue_id: string;
    project_key: string;
    number: number;
  }>(
    `SELECT
       link.project_id,
       link.issue_id,
       project.key AS project_key,
       issue.number
     FROM issue_wiki_links AS link
     JOIN projects AS project ON project.id = link.project_id
     JOIN issues AS issue ON issue.id = link.issue_id
     WHERE link.id = $1`,
    [input.linkID]
  );
  const row = result.rows[0];
  if (!row) return null;
  await requireZeroWikiProject({
    userID: input.userID,
    projectID: row.project_id,
    role: "MEMBER",
  });
  await getZeroPool().query(
    "DELETE FROM issue_wiki_links WHERE id = $1",
    [input.linkID]
  );
  return { issueKey: `${row.project_key}-${row.number}` };
}
