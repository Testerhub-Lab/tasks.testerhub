import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listWorkspaceArticles, readWorkspaceArticle, saveWorkspaceArticle } from "./workspaceWiki";

const fixture = vi.hoisted(() => ({ client: null as Client | null }));
vi.mock("../../zero/db", () => ({ getZeroPool: () => fixture.client }));
vi.mock("../auth/zero-store", () => ({ usesZeroAuthStore: () => true }));

describe.skipIf(!process.env.WORKSPACE_WIKI_TEST_DATABASE_URL)("workspace Wiki in PostgreSQL", () => {
  const owner = randomUUID(), viewer = randomUUID();
  const personal = { workspaceId: randomUUID(), userId: owner };
  const team = { workspaceId: randomUUID(), userId: owner };

  beforeAll(async () => {
    const client = new Client({ connectionString: process.env.WORKSPACE_WIKI_TEST_DATABASE_URL });
    await client.connect();
    fixture.client = client;
    await client.query("BEGIN");
    await client.query("INSERT INTO users (id) VALUES ($1), ($2)", [owner, viewer]);
    for (const { workspaceId } of [personal, team]) {
      await client.query("INSERT INTO workspaces (id, name, slug, created_by_id) VALUES ($1, 'Wiki test', $2, $3)",
        [workspaceId, `wiki-${workspaceId}`, owner]);
      await client.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')",
        [workspaceId, owner]);
    }
    await client.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'VIEWER')",
      [personal.workspaceId, viewer]);
  });

  afterAll(async () => {
    if (fixture.client) {
      await fixture.client.query("ROLLBACK");
      await fixture.client.end();
    }
  });

  it("stores a page without a product and rejects stale edits", async () => {
    const page = { id: randomUUID(), title: "Первая страница", markdown: "Текст", version: 0 };
    expect(await saveWorkspaceArticle(personal, page)).toBe(true);
    expect(await saveWorkspaceArticle(personal, page)).toBe(true);
    expect((await listWorkspaceArticles(personal)).filter(row => row.id === page.id)).toHaveLength(1);
    expect(await saveWorkspaceArticle(personal, { ...page, version: 1, markdown: "Новое" })).toBe(true);
    expect(await saveWorkspaceArticle(personal, { ...page, version: 1, markdown: "Устаревшее" })).toBe(false);
    expect(await readWorkspaceArticle(personal, page.id)).toMatchObject({ version: 2, markdown: "Новое" });
  });

  it("scopes reads and writes to the active workspace and its role", async () => {
    const page = { id: randomUUID(), title: "Личная заметка", markdown: "", version: 0 };
    await saveWorkspaceArticle(personal, page);
    expect(await readWorkspaceArticle(team, page.id)).toBeNull();
    expect(await listWorkspaceArticles(team)).toEqual([]);
    expect(await saveWorkspaceArticle(team, { ...page, version: 1 })).toBe(false);
    const readOnly = { ...personal, userId: viewer };
    expect(await readWorkspaceArticle(readOnly, page.id)).toMatchObject({ canWrite: false });
    expect(await saveWorkspaceArticle(readOnly, { ...page, id: randomUUID() })).toBe(false);
    expect(await saveWorkspaceArticle(readOnly, { ...page, version: 1 })).toBe(false);
    expect(await readWorkspaceArticle({ ...personal, userId: randomUUID() }, page.id)).toBeNull();
  });
});
