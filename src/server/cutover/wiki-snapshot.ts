import { createHash } from "node:crypto";
import { z } from "zod";

const revisionSchema = z.object({
  sourceID: z.string().min(1),
  version: z.number().int().positive(),
  title: z.string().min(1).max(160),
  contentMarkdown: z.string(),
  createdAt: z.string().datetime(),
});

const pageSchema = z.object({
  sourceID: z.string().min(1),
  sourceParentID: z.string().min(1).nullable(),
  title: z.string().min(1).max(160),
  slug: z.string().min(1).max(200),
  contentMarkdown: z.string(),
  sortOrder: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
  revisions: z.array(revisionSchema).min(1),
});

const issueLinkSchema = z.object({
  sourceID: z.string().min(1),
  issueKey: z.string().min(1),
  documentKey: z.string().min(1),
  title: z.string(),
  createdAt: z.string().datetime(),
});

const projectSchema = z.object({
  sourceID: z.string().min(1),
  key: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z][A-Z0-9]{1,9}$/),
  name: z.string().min(1).max(120),
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
  pages: z.array(pageSchema),
  issueLinks: z.array(issueLinkSchema),
});

const snapshotSchema = z.object({
  format: z.literal("pulsar-native-wiki-cutover"),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  projects: z.array(projectSchema).min(1),
});

export type WikiCutoverSnapshot = z.infer<typeof snapshotSchema>;
export type WikiCutoverProject = WikiCutoverSnapshot["projects"][number];
export type WikiCutoverPage = WikiCutoverProject["pages"][number];

function unique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`Duplicate ${label}`);
  }
}

export function orderWikiPages(pages: readonly WikiCutoverPage[]) {
  const byID = new Map(pages.map((page) => [page.sourceID, page]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: WikiCutoverPage[] = [];

  const visit = (page: WikiCutoverPage) => {
    if (visited.has(page.sourceID)) return;
    if (visiting.has(page.sourceID)) {
      throw new Error(`Wiki tree cycle at ${page.sourceID}`);
    }
    visiting.add(page.sourceID);
    if (page.sourceParentID) {
      const parent = byID.get(page.sourceParentID);
      if (!parent) {
        throw new Error(
          `Wiki parent ${page.sourceParentID} is missing for ${page.sourceID}`
        );
      }
      visit(parent);
    }
    visiting.delete(page.sourceID);
    visited.add(page.sourceID);
    ordered.push(page);
  };

  for (const page of pages) visit(page);
  return ordered;
}

export function parseWikiCutoverSnapshot(input: unknown): WikiCutoverSnapshot {
  const snapshot = snapshotSchema.parse(input);
  unique(
    snapshot.projects.map((project) => project.key),
    "project key"
  );
  unique(
    snapshot.projects.map((project) => project.sourceID),
    "source project ID"
  );

  for (const project of snapshot.projects) {
    unique(
      project.pages.map((page) => page.sourceID),
      `page ID in ${project.key}`
    );
    unique(
      project.pages.map((page) => page.slug),
      `page slug in ${project.key}`
    );
    orderWikiPages(project.pages);
    const pageIDs = new Set(project.pages.map((page) => page.sourceID));

    for (const page of project.pages) {
      unique(
        page.revisions.map((revision) => revision.sourceID),
        `revision ID for ${project.key}/${page.slug}`
      );
      const versions = page.revisions
        .map((revision) => revision.version)
        .sort((left, right) => left - right);
      const expected = Array.from(
        { length: page.version },
        (_, index) => index + 1
      );
      if (versions.join(",") !== expected.join(",")) {
        throw new Error(
          `Wiki revision sequence mismatch for ${project.key}/${page.slug}`
        );
      }
    }

    for (const link of project.issueLinks) {
      if (!pageIDs.has(link.documentKey)) {
        throw new Error(
          `Wiki link ${link.sourceID} references missing page ${link.documentKey}`
        );
      }
    }
  }

  return snapshot;
}

export function serializeWikiCutoverSnapshot(snapshot: WikiCutoverSnapshot) {
  return `${JSON.stringify(parseWikiCutoverSnapshot(snapshot), null, 2)}\n`;
}

export function wikiCutoverChecksum(serialized: string) {
  return createHash("sha256").update(serialized).digest("hex");
}

export function requireIssueLinkDropApproval(
  snapshot: WikiCutoverSnapshot,
  approved: boolean
) {
  const count = snapshot.projects.reduce(
    (total, project) => total + project.issueLinks.length,
    0
  );
  if (count > 0 && !approved) {
    throw new Error(
      `${count} issue-to-Wiki links require explicit drop approval`
    );
  }
  return count;
}
