# Zero Stage 2 application schema

`schema.sql` creates the clean Pulsar application model for Stage 2. It is
mounted only by the isolated validation stack in `infra/zero-spike`; the
current production database and production traffic are not changed.

The schema uses client-generated UUID primary keys, workspace-owned workflows,
text fractional ranks, normalized tags/participants/attachments, versioned
Wiki pages/revisions, normalized issue-to-Wiki links, and a server-only audit
log. `pulsar_zero_data` is an explicit table-and-column allowlist. These tables
are intentionally excluded:

- `auth_identities` (provider identifiers and password hashes);
- `sessions` (session token hashes and request metadata);
- `audit_events` (potentially sensitive change payloads);
- `api_tokens`, `api_idempotency_keys` and `api_audit_logs` (REST secrets and
  security records).

The temporary PULSAR-6 spike table and UI remain available in branch history,
but are not part of the active Zero schema or publication.

Issue search stays server-side. PostgreSQL `pg_trgm`, a `simple` full-text GIN
index, and title/description trigram indexes select authorized candidate IDs;
the REST domain then reads the entities through the batched `issues.byIDs`
named Zero query. Search indexes are database-only and are not part of the
Zero publication.

## Permission boundary

- Every application query is a named query and adds a `workspace_members`
  existence check using the authenticated `ctx.userID`.
- Legacy/raw queries and CRUD mutations are disabled in the Zero schema.
- `VIEWER` is read-only; `MEMBER` can change issues, comments, Wiki pages and
  links, tags, participants and attachment metadata; `ADMIN` manages workflows
  and projects; only `OWNER` can grant `ADMIN`.
- Wiki queries additionally require an active page in a project whose provider
  is `NATIVE`; revision history and issue links inherit the same boundary.
- Mutators derive `workspace_id`, actor IDs and issue numbers on the server-side
  transaction instead of accepting those security-sensitive values from the
  client.
- Critical workspace/project/workflow/issue changes are appended to
  `audit_events` only by the authoritative server transaction.
- REST domain writes append external API audit and idempotency records through
  the underlying Zero PostgreSQL transaction. A failure in any of those steps
  rolls back the whole command; replay is serialized per token/key with a
  transaction-scoped advisory lock.

Contract and negative permission tests live next to the Zero implementation in
`src/zero/*.test.ts`. The real PostgreSQL adapter check can be run against an
isolated Stage 2 database with:

```bash
ZERO_UPSTREAM_DB=postgresql://... npm run zero:permissions:check
```
