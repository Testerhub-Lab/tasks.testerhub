import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { zeroSchema } from "./schema";

const stage2SQL = readFileSync(
  resolve(process.cwd(), "infra/zero-stage2/schema.sql"),
  "utf8"
);
const legacyPrismaSchema = readFileSync(
  resolve(process.cwd(), "prisma/schema.prisma"),
  "utf8"
);
const publicationSQL = stage2SQL.slice(
  stage2SQL.indexOf("CREATE PUBLICATION pulsar_zero_data")
);

describe("Zero publications", () => {
  it("publishes every application table and column from the Zero schema", () => {
    for (const table of Object.values(zeroSchema.tables)) {
      const serverName =
        "serverName" in table ? table.serverName : table.name;

      const tablePattern = new RegExp(
        `\\b${serverName}\\s*\\(([^)]*)\\)`,
        "m"
      );
      const match = publicationSQL.match(tablePattern);
      expect(match, `${serverName} is not explicitly published`).not.toBeNull();

      const publishedColumns = match![1]
        .split(",")
        .map((column) => column.trim())
        .filter(Boolean)
        .sort();
      const schemaColumns = Object.entries(table.columns)
        .map(([name, column]) =>
          "serverName" in column ? column.serverName : name
        )
        .sort();

      expect(publishedColumns).toEqual(schemaColumns);
    }
  });

  it("keeps credentials, sessions and audit payloads outside application replication", () => {
    expect(publicationSQL).not.toMatch(/\bauth_identities\s*\(/);
    expect(publicationSQL).not.toMatch(/\bsessions\s*\(/);
    expect(publicationSQL).not.toMatch(/\baudit_events\s*\(/);
    expect(publicationSQL).not.toMatch(/\bapi_tokens\s*\(/);
    expect(publicationSQL).not.toMatch(/\bapi_audit_logs\s*\(/);
    expect(publicationSQL).not.toMatch(/\bapi_idempotency_keys\s*\(/);
    expect(publicationSQL).not.toMatch(/\bpassword_hash\b/);
    expect(publicationSQL).not.toMatch(/\btoken_hash\b/);
    expect(publicationSQL).not.toMatch(/FOR\s+ALL\s+TABLES/i);
    expect(publicationSQL).not.toMatch(/FOR\s+TABLES\s+IN\s+SCHEMA/i);
  });

  it("keeps REST issue keys globally unambiguous", () => {
    expect(stage2SQL).toMatch(
      /CREATE TABLE projects[\s\S]*?\bUNIQUE \(key\)/
    );
    expect(stage2SQL).not.toMatch(/\bUNIQUE \(workspace_id, key\)/);
    expect(stage2SQL).toMatch(
      /CREATE TABLE issues[\s\S]*?\btype text NOT NULL DEFAULT 'TASK'/
    );
  });

  it("installs and indexes the dedicated PostgreSQL issue search", () => {
    expect(stage2SQL).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/);
    expect(stage2SQL).toMatch(
      /CREATE INDEX issues_search_fts_idx[\s\S]*?to_tsvector\('simple'/
    );
    expect(stage2SQL).toMatch(
      /CREATE INDEX issues_title_trgm_idx[\s\S]*?gin_trgm_ops/
    );
    expect(stage2SQL).toMatch(
      /CREATE INDEX issues_description_trgm_idx[\s\S]*?gin_trgm_ops/
    );
  });

  it("keeps API security records server-only in the new database", () => {
    expect(stage2SQL).toMatch(/CREATE TABLE api_tokens[\s\S]*?token_hash text/);
    expect(stage2SQL).toMatch(/CREATE TABLE api_audit_logs/);
    expect(stage2SQL).toMatch(/CREATE TABLE api_idempotency_keys/);
    expect(legacyPrismaSchema).not.toMatch(/\bmodel ApiToken\b/);
    expect(legacyPrismaSchema).not.toMatch(/\bmodel ApiAuditLog\b/);
    expect(legacyPrismaSchema).not.toMatch(/\bmodel ApiIdempotencyKey\b/);
  });
});
