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

For the current PostgreSQL 18 production database, use the documented routine in
`infra/production/backup/`:

```bash
infra/production/backup/backup.sh
infra/production/backup/restore-check.sh /home/deploy/pulsar-pg18-backups/<timestamp>/pulsar-pg18-<timestamp>.dump
```

The routine creates a custom-format dump, SHA-256 checksum, and restore-check
summary without printing secrets.

After the manual routine is verified, use the automated S3/off-server routine:

```bash
infra/production/backup/backup-and-upload.sh
infra/production/backup/install-cron.sh
```

By default it uploads backup generations under `backups/postgres/` in the
configured S3 bucket, retains 14 daily, 8 weekly, and 6 monthly S3 generations,
and keeps the latest 7 local generations on the production server.

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

## Completed production cutover — 2026-07-28

Production now runs the `pulsar-prod` Compose project with PostgreSQL 18.4,
the Zero-backed web application, and Zero Cache 1.8.0. Nginx exposes Zero under
`/zero-cache/`; the application remains on the existing domain and port, and
the UI design was not changed.

The accepted final legacy backup is:

- server: `/home/deploy/pulsar-cutover-backups/pulsar-legacy-final-20260728T115510Z.dump`;
- off-server: `C:\Users\strat\Documents\Pulsar Backups\2026-07-28\pulsar-legacy-final-20260728T115510Z.dump`;
- SHA-256: `9de99ec3c441605e335abc2e2bf65b89a88ca727b7b2bdf0bdc5420a655fd264`.

A disposable PostgreSQL 14 restore verified 2 users, 4 legacy workspaces,
3 projects, 23 issues, 20 comments, 3 Wiki pages, 21 revisions, 18 Wiki links,
and 1 API token. The production import intentionally omitted the empty legacy
workspace and preserved all other counts. The migrated API token continued to
work through REST and the stdio MCP server.

Production smoke covered password login/session, issues, Wiki, settings, trash,
REST, MCP, public Zero keepalive, active logical replication with zero-byte WAL
lag, and a real FirstVDS S3 CORS → PUT → confirm → list → download round trip.
The S3 smoke attachment is recorded on `PULSAR-17`.

The stopped `tasks-web-1` container and the legacy PostgreSQL database remain
available as the rollback source during stabilization. Do not remove either
until the stabilization window is explicitly closed. The generated
administrator credential remains only in
`/home/deploy/.config/pulsar/cutover-admin.env` with mode 600.
