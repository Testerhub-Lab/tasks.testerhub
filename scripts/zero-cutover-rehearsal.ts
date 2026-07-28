import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import prisma from "../src/lib/prisma";
import { hashPassword } from "../src/server/auth/password";
import { registerZeroPasswordUser } from "../src/server/auth/zero-store";
import {
  orderWikiPages,
  parseWikiCutoverSnapshot,
  requireIssueLinkDropApproval,
  serializeWikiCutoverSnapshot,
  wikiCutoverChecksum,
  type WikiCutoverSnapshot,
} from "../src/server/cutover/wiki-snapshot";
import { getZeroPool } from "../src/zero/db";

const forcedRollbackMessage = "forced cutover import rollback";

function enabled(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function digest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

async function seedLegacyFixture() {
  const key = process.env.CUTOVER_FIXTURE_PROJECT_KEY?.trim() || "CUTR";
  if (await prisma.project.findUnique({ where: { key }, select: { id: true } })) {
    throw new Error(`Legacy fixture project ${key} already exists`);
  }

  const owner = await prisma.user.create({
    data: {
      email: `legacy-cutover-${randomUUID()}@rehearsal.invalid`,
      name: "Legacy Cutover Owner",
    },
    select: { id: true },
  });
  const workspace = await prisma.workspace.create({
    data: {
      name: "Legacy Cutover Workspace",
      slug: `legacy-cutover-${randomUUID().slice(0, 8)}`,
      personalOwnerId: owner.id,
    },
    select: { id: true },
  });
  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: owner.id,
      role: "ADMIN",
    },
  });
  const project = await prisma.project.create({
    data: {
      key,
      name: "Cutover rehearsal",
      workspaceId: workspace.id,
      knowledge: {
        create: { provider: "NATIVE" },
      },
      members: {
        create: {
          userId: owner.id,
          role: "ADMIN",
        },
      },
    },
    select: { id: true },
  });
  const root = await prisma.wikiPage.create({
    data: {
      projectId: project.id,
      title: "Architecture",
      slug: "architecture",
      contentMarkdown: "# Architecture\n\nVersion 2",
      sortOrder: 0,
      version: 2,
      createdById: owner.id,
      updatedById: owner.id,
      revisions: {
        create: [
          {
            version: 1,
            title: "Architecture",
            contentMarkdown: "# Architecture\n\nVersion 1",
            createdById: owner.id,
          },
          {
            version: 2,
            title: "Architecture",
            contentMarkdown: "# Architecture\n\nVersion 2",
            createdById: owner.id,
          },
        ],
      },
    },
    select: { id: true },
  });
  await prisma.wikiPage.create({
    data: {
      projectId: project.id,
      parentId: root.id,
      title: "Runbook",
      slug: "runbook",
      contentMarkdown: "# Runbook\n\nKeep this tree.",
      sortOrder: 1,
      version: 1,
      createdById: owner.id,
      updatedById: owner.id,
      revisions: {
        create: {
          version: 1,
          title: "Runbook",
          contentMarkdown: "# Runbook\n\nKeep this tree.",
          createdById: owner.id,
        },
      },
    },
  });
  const issue = await prisma.task.create({
    data: {
      projectId: project.id,
      number: 1,
      key: `${key}-1`,
      title: "Disposable rehearsal issue",
      creatorId: owner.id,
      reporterId: owner.id,
    },
    select: { id: true, key: true },
  });
  await prisma.knowledgeLink.create({
    data: {
      taskId: issue.id,
      projectId: project.id,
      provider: "NATIVE",
      documentKey: root.id,
      title: "Architecture",
      createdById: owner.id,
    },
  });

  return key;
}

async function readLegacyWikiProjects(): Promise<
  WikiCutoverSnapshot["projects"]
> {
  const projects = await prisma.project.findMany({
    where: {
      knowledge: {
        is: { provider: "NATIVE" },
      },
    },
    orderBy: [{ key: "asc" }, { id: "asc" }],
    include: {
      wikiPages: {
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }],
        include: {
          revisions: {
            orderBy: [{ version: "asc" }, { id: "asc" }],
          },
        },
      },
      knowledgeLinks: {
        where: { provider: "NATIVE" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          task: {
            select: { key: true },
          },
        },
      },
    },
  });

  return projects.map((project) => ({
    sourceID: project.id,
    key: project.key,
    name: project.name,
    createdAt: project.createdAt.toISOString(),
    archivedAt: project.archivedAt?.toISOString() ?? null,
    pages: project.wikiPages.map((page) => ({
      sourceID: page.id,
      sourceParentID: page.parentId,
      title: page.title,
      slug: page.slug,
      contentMarkdown: page.contentMarkdown,
      sortOrder: page.sortOrder,
      version: page.version,
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
      archivedAt: page.archivedAt?.toISOString() ?? null,
      revisions: page.revisions.map((revision) => ({
        sourceID: revision.id,
        version: revision.version,
        title: revision.title,
        contentMarkdown: revision.contentMarkdown,
        createdAt: revision.createdAt.toISOString(),
      })),
    })),
    issueLinks: project.knowledgeLinks.map((link) => ({
      sourceID: link.id,
      issueKey: link.task.key,
      documentKey: link.documentKey,
      title: link.title,
      createdAt: link.createdAt.toISOString(),
    })),
  }));
}

type ImportedIDs = {
  projectIDs: Map<string, string>;
  pageIDs: Map<string, string>;
};

async function importWikiSnapshot(input: {
  snapshot: WikiCutoverSnapshot;
  actorID: string;
  workspaceID: string;
  workflowID: string;
  checksum: string;
  forceRollback?: boolean;
}): Promise<ImportedIDs> {
  const client = await getZeroPool().connect();
  const projectIDs = new Map<string, string>();
  const pageIDs = new Map<string, string>();

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["pulsar-cutover-wiki-v1"]
    );

    for (const project of input.snapshot.projects) {
      const projectID = randomUUID();
      projectIDs.set(project.sourceID, projectID);
      await client.query(
        `INSERT INTO projects (
           id, workspace_id, workflow_id, key, name, knowledge_provider,
           next_issue_number, created_by_id, created_at, updated_at, archived_at
         ) VALUES (
           $1, $2, $3, $4, $5, 'NATIVE',
           1, $6, $7, $7, $8
         )`,
        [
          projectID,
          input.workspaceID,
          input.workflowID,
          project.key,
          project.name,
          input.actorID,
          project.createdAt,
          project.archivedAt,
        ]
      );

      for (const page of project.pages) {
        pageIDs.set(page.sourceID, randomUUID());
      }
      for (const page of orderWikiPages(project.pages)) {
        const pageID = pageIDs.get(page.sourceID);
        if (!pageID) throw new Error(`Missing target ID for ${page.sourceID}`);
        const parentID = page.sourceParentID
          ? pageIDs.get(page.sourceParentID)
          : null;
        await client.query(
          `INSERT INTO wiki_pages (
             id, workspace_id, project_id, parent_id, title, slug,
             content_markdown, sort_order, version, created_by_id,
             updated_by_id, created_at, updated_at, archived_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10,
             $10, $11, $12, $13
           )`,
          [
            pageID,
            input.workspaceID,
            projectID,
            parentID,
            page.title,
            page.slug,
            page.contentMarkdown,
            page.sortOrder,
            page.version,
            input.actorID,
            page.createdAt,
            page.updatedAt,
            page.archivedAt,
          ]
        );
        for (const revision of page.revisions) {
          await client.query(
            `INSERT INTO wiki_page_revisions (
               id, workspace_id, project_id, page_id, version, title,
               content_markdown, created_by_id, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              randomUUID(),
              input.workspaceID,
              projectID,
              pageID,
              revision.version,
              revision.title,
              revision.contentMarkdown,
              input.actorID,
              revision.createdAt,
            ]
          );
        }
      }

      await client.query(
        `INSERT INTO audit_events (
           id, workspace_id, actor_id, action, entity_type, entity_id, changes
         ) VALUES (
           $1, $2, $3, 'cutover.wiki_imported', 'project', $4, $5::jsonb
         )`,
        [
          randomUUID(),
          input.workspaceID,
          input.actorID,
          projectID,
          JSON.stringify({
            authorStrategy: "cutover-admin",
            checksum: input.checksum,
            pages: project.pages.length,
            revisions: project.pages.reduce(
              (total, page) => total + page.revisions.length,
              0
            ),
            droppedIssueLinks: project.issueLinks.length,
          }),
        ]
      );
    }

    if (input.forceRollback) throw new Error(forcedRollbackMessage);
    await client.query("COMMIT");
    return { projectIDs, pageIDs };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function verifyRollback(projectKeys: readonly string[]) {
  const result = await getZeroPool().query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM projects
     WHERE key = ANY($1::text[])`,
    [projectKeys]
  );
  if (result.rows[0]?.count !== "0") {
    throw new Error("Forced cutover failure left imported projects behind");
  }
}

async function verifyImportedWiki(
  snapshot: WikiCutoverSnapshot,
  imported: ImportedIDs
) {
  let pages = 0;
  let revisions = 0;

  for (const project of snapshot.projects) {
    const projectID = imported.projectIDs.get(project.sourceID);
    if (!projectID) throw new Error(`Missing imported project ${project.key}`);
    const projectRow = await getZeroPool().query<{
      key: string;
      name: string;
      knowledge_provider: string;
      created_at: Date;
      archived_at: Date | null;
    }>(
      `SELECT key, name, knowledge_provider, created_at, archived_at
       FROM projects
       WHERE id = $1`,
      [projectID]
    );
    const targetProject = projectRow.rows[0];
    if (
      targetProject?.key !== project.key ||
      targetProject.name !== project.name ||
      targetProject.knowledge_provider !== "NATIVE" ||
      targetProject.created_at.toISOString() !== project.createdAt ||
      targetProject.archived_at?.toISOString() !==
        (project.archivedAt ?? undefined)
    ) {
      throw new Error(`Imported project mismatch for ${project.key}`);
    }

    const pageRows = await getZeroPool().query<{
      id: string;
      parent_id: string | null;
      title: string;
      slug: string;
      content_markdown: string;
      sort_order: number;
      version: number;
      created_at: Date;
      updated_at: Date;
      archived_at: Date | null;
    }>(
      `SELECT
         id, parent_id, title, slug, content_markdown, sort_order, version,
         created_at, updated_at, archived_at
       FROM wiki_pages
       WHERE project_id = $1`,
      [projectID]
    );
    if (pageRows.rowCount !== project.pages.length) {
      throw new Error(`Imported page count mismatch for ${project.key}`);
    }

    for (const sourcePage of project.pages) {
      const pageID = imported.pageIDs.get(sourcePage.sourceID);
      const targetPage = pageRows.rows.find((page) => page.id === pageID);
      const expectedParentID = sourcePage.sourceParentID
        ? imported.pageIDs.get(sourcePage.sourceParentID)
        : null;
      if (
        !targetPage ||
        targetPage.parent_id !== expectedParentID ||
        targetPage.title !== sourcePage.title ||
        targetPage.slug !== sourcePage.slug ||
        targetPage.content_markdown !== sourcePage.contentMarkdown ||
        targetPage.sort_order !== sourcePage.sortOrder ||
        targetPage.version !== sourcePage.version ||
        targetPage.created_at.toISOString() !== sourcePage.createdAt ||
        targetPage.updated_at.toISOString() !== sourcePage.updatedAt ||
        targetPage.archived_at?.toISOString() !==
          (sourcePage.archivedAt ?? undefined)
      ) {
        throw new Error(
          `Imported page mismatch for ${project.key}/${sourcePage.slug}`
        );
      }

      const revisionRows = await getZeroPool().query<{
        version: number;
        title: string;
        content_markdown: string;
        created_at: Date;
      }>(
        `SELECT version, title, content_markdown, created_at
         FROM wiki_page_revisions
         WHERE page_id = $1
         ORDER BY version`,
        [pageID]
      );
      if (revisionRows.rowCount !== sourcePage.revisions.length) {
        throw new Error(
          `Imported revision count mismatch for ${project.key}/${sourcePage.slug}`
        );
      }
      for (const sourceRevision of sourcePage.revisions) {
        const targetRevision = revisionRows.rows.find(
          (revision) => revision.version === sourceRevision.version
        );
        if (
          !targetRevision ||
          targetRevision.title !== sourceRevision.title ||
          targetRevision.content_markdown !== sourceRevision.contentMarkdown ||
          targetRevision.created_at.toISOString() !== sourceRevision.createdAt
        ) {
          throw new Error(
            `Imported revision mismatch for ${project.key}/${sourcePage.slug}@${sourceRevision.version}`
          );
        }
      }
      pages += 1;
      revisions += sourcePage.revisions.length;
    }
  }

  return { pages, revisions };
}

function responseCookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

async function verifyAdminLogin(input: {
  baseURL: string;
  email: string;
  password: string;
  workspaceID: string;
}) {
  const login = await fetch(`${input.baseURL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
  if (!login.ok) {
    throw new Error(`Cutover admin login returned ${login.status}`);
  }
  const cookies = responseCookies(login);
  if (!cookies.includes(`th_workspace=${input.workspaceID}`)) {
    throw new Error("Cutover admin login returned a different workspace");
  }
  const me = await fetch(`${input.baseURL}/api/auth/me`, {
    headers: { Cookie: cookies },
  });
  const identity = (await me.json()) as {
    ok?: boolean;
    user?: { email?: string };
  };
  if (!me.ok || identity.user?.email !== input.email.toLowerCase()) {
    throw new Error("Cutover admin session did not resolve");
  }
  const zeroPage = await fetch(`${input.baseURL}/zero`, {
    headers: { Cookie: cookies },
    redirect: "manual",
  });
  if (zeroPage.status !== 200) {
    throw new Error(`Zero workspace shell returned ${zeroPage.status}`);
  }
}

async function main() {
  if (enabled("CUTOVER_SEED_FIXTURE")) await seedLegacyFixture();

  const sourceProjects = await readLegacyWikiProjects();
  const sourceDigest = digest(sourceProjects);
  const snapshot = parseWikiCutoverSnapshot({
    format: "pulsar-native-wiki-cutover",
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: sourceProjects,
  });
  const serialized = serializeWikiCutoverSnapshot(snapshot);
  const checksum = wikiCutoverChecksum(serialized);
  const exportPath =
    process.env.CUTOVER_EXPORT_PATH?.trim() ||
    "/tmp/pulsar-native-wiki-cutover.json";
  await mkdir(dirname(exportPath), { recursive: true });
  await writeFile(exportPath, serialized, { encoding: "utf8", mode: 0o600 });
  await writeFile(`${exportPath}.sha256`, `${checksum}  ${exportPath}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  const readBack = await readFile(exportPath, "utf8");
  const expectedChecksum = (
    await readFile(`${exportPath}.sha256`, "utf8")
  ).split(/\s+/)[0];
  if (
    expectedChecksum !== checksum ||
    wikiCutoverChecksum(readBack) !== checksum
  ) {
    throw new Error("Wiki cutover export checksum mismatch");
  }
  const artifact = parseWikiCutoverSnapshot(JSON.parse(readBack));
  const droppedIssueLinks = requireIssueLinkDropApproval(
    artifact,
    enabled("CUTOVER_ALLOW_DROP_ISSUE_LINKS")
  );

  const adminEmail = required("CUTOVER_ADMIN_EMAIL").toLowerCase();
  const adminPassword = required("CUTOVER_ADMIN_PASSWORD");
  if (adminPassword.length < 8 || adminPassword.length > 128) {
    throw new Error("CUTOVER_ADMIN_PASSWORD must contain 8-128 characters");
  }
  const admin = await registerZeroPasswordUser({
    email: adminEmail,
    passwordHash: await hashPassword(adminPassword),
    displayName: "Pulsar Administrator",
  });
  const workflow = await getZeroPool().query<{ id: string }>(
    `SELECT id
     FROM workflows
     WHERE workspace_id = $1 AND is_default AND archived_at IS NULL`,
    [admin.workspaceID]
  );
  const workflowID = workflow.rows[0]?.id;
  if (!workflowID) throw new Error("Cutover admin default workflow is missing");

  if (enabled("CUTOVER_VERIFY_ROLLBACK")) {
    try {
      await importWikiSnapshot({
        snapshot: artifact,
        actorID: admin.id,
        workspaceID: admin.workspaceID,
        workflowID,
        checksum,
        forceRollback: true,
      });
      throw new Error("Forced cutover rollback did not fail");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== forcedRollbackMessage
      ) {
        throw error;
      }
    }
    await verifyRollback(artifact.projects.map((project) => project.key));
  }

  const imported = await importWikiSnapshot({
    snapshot: artifact,
    actorID: admin.id,
    workspaceID: admin.workspaceID,
    workflowID,
    checksum,
  });
  const importedCounts = await verifyImportedWiki(artifact, imported);
  await verifyAdminLogin({
    baseURL: process.env.CUTOVER_BASE_URL?.trim() || "http://localhost:3000",
    email: adminEmail,
    password: adminPassword,
    workspaceID: admin.workspaceID,
  });

  const sourceAfter = await readLegacyWikiProjects();
  if (digest(sourceAfter) !== sourceDigest) {
    throw new Error("Cutover rehearsal changed the legacy Wiki source");
  }
  const publication = await getZeroPool().query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM pg_publication_tables
     WHERE
       pubname = 'pulsar_zero_data'
       AND tablename IN ('auth_identities', 'sessions')`
  );
  if (publication.rows[0]?.count !== "0") {
    throw new Error("Auth tables appeared in the Zero publication");
  }

  console.log(
    JSON.stringify({
      adminLogin: true,
      artifactChecksum: checksum,
      artifactRoundTrip: true,
      authorStrategy: "cutover-admin",
      droppedIssueLinks,
      importedPages: importedCounts.pages,
      importedProjects: artifact.projects.length,
      importedRevisions: importedCounts.revisions,
      sourceUnchanged: true,
      transactionRollback: enabled("CUTOVER_VERIFY_ROLLBACK"),
      wikiTreePreserved: true,
      zeroWorkspaceShell: true,
    })
  );
}

void main().finally(async () => {
  await prisma.$disconnect();
  await getZeroPool().end();
});
