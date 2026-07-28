# Pulsar production database

This Compose file is the isolated PostgreSQL 18.4 contour for Pulsar. It does
not connect to or modify the shared host PostgreSQL 14 cluster.

## Safety boundary

- PostgreSQL has no published host port.
- The database is reachable only on the internal Compose `data` network.
- Database files live in the project-scoped `postgres-data` named volume.
- `pulsar_app` owns the application database and is not a superuser.
- `pulsar_zero` is the isolated PostgreSQL administrator used by the official
  image and, after the Zero production gate is closed, by `zero-cache`.
- Use a unique Compose project name for every validation contour. Never reuse a
  validation volume for production.

## Configuration

Create the real interpolation file outside the repository:

```bash
install -m 600 infra/production/.env.example /srv/tasks/production.env
```

Replace all three passwords with independent random hexadecimal values.
Keep `/srv/tasks/.env` as the application environment file and make it mode 600.
For a side-by-side validation, set `PULSAR_WEB_IMAGE` to a unique local tag so
the build cannot replace the image tag used by the current production container.

Validate the rendered model before starting anything:

```bash
docker compose \
  -p pulsar-next \
  --env-file /srv/tasks/production.env \
  -f infra/production/compose.yml \
  config --quiet
```

## First start and schema

```bash
docker compose \
  -p pulsar-next \
  --env-file /srv/tasks/production.env \
  -f infra/production/compose.yml \
  up -d postgres
```

The PostgreSQL entrypoint creates the Zero schema and grants the application
role only the DML privileges required by the web service. There are no Prisma
migrations in this contour.

Starting PostgreSQL does not switch production traffic. For side-by-side
validation, override `APP_PORT` and `ZERO_CACHE_PORT` with unused loopback ports
before starting `web` and `zero-cache`.

## Production cutover

1. Build and validate a separate `pulsar-next` project.
2. Stop the legacy web container to prevent new writes.
3. Create a final custom-format dump, checksum it, copy it off the server, and
   verify a complete restore into disposable PostgreSQL.
4. Import the final snapshot into an empty `pulsar-prod` database:

   ```bash
   CUTOVER_LEGACY_DATABASE_URL=... \
   ZERO_UPSTREAM_DB=... \
   CUTOVER_ADMIN_EMAIL=... \
   CUTOVER_ADMIN_PASSWORD=... \
   CUTOVER_CONFIRM=production \
   npm run zero:production:cutover
   ```

5. Start `pulsar-prod`, install `nginx-pulsar.testerhub.ru.conf`, validate Nginx,
   reload it, and smoke-test authentication, UI, Wiki, REST/MCP, and S3 upload.

The importer rejects a non-empty target. Use `CUTOVER_DRY_RUN=true` without
`CUTOVER_CONFIRM` during rehearsal; the whole target transaction is rolled back.
Keep the legacy database and container intact until all smoke tests pass.

Changing passwords in `production.env` does not rotate roles in an existing
volume; password rotation requires an explicit `ALTER ROLE`.

## Backup rule

A named volume is persistence, not a backup. Before cutover, create a
custom-format `pg_dump`, record its SHA-256 checksum, restore it into a separate
temporary PostgreSQL container, and verify the restored schema and row counts.
Copy accepted backups off the production server.

For major PostgreSQL upgrades, never change only the image major tag. Use a
tested `pg_dump`/`pg_restore` or `pg_upgrade` procedure.

## Validated baseline

The side-by-side contour was validated on 2026-07-26 without changing the
current production traffic or the shared host PostgreSQL 14 cluster:

- official PostgreSQL `18.4-trixie`, logical WAL, private Docker network;
- all 24 existing Prisma migrations applied to a fresh database;
- application sign-in returned HTTP 200 and persisted through restart;
- a custom-format dump restored into a separate temporary PostgreSQL 18 volume
  with matching application and migration row counts;
- the current production container remained available on its original port.

On 2026-07-28 the production importer was also rehearsed against a restored
production snapshot. Dry-run rollback and committed import both preserved the
expected counts: 2 users, 3 non-empty workspaces, 3 projects, 23 issues,
20 comments, 3 Wiki pages, 21 revisions, 18 issue/Wiki links, and 1 API token.
