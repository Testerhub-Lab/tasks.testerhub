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

Replace both database passwords with independent random hexadecimal values.
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

docker compose \
  -p pulsar-next \
  --env-file /srv/tasks/production.env \
  -f infra/production/compose.yml \
  run --rm web npx prisma migrate deploy
```

Starting PostgreSQL does not switch production traffic. Start `web` only on an
unused loopback port during validation. Production cutover is a separate step.

Changing passwords in `production.env` does not rotate roles in an existing
volume; password rotation requires an explicit `ALTER ROLE`.

## Backup rule

A named volume is persistence, not a backup. Before cutover, create a
custom-format `pg_dump`, record its SHA-256 checksum, restore it into a separate
temporary PostgreSQL 18 container, and verify the restored schema and row
counts. Copy accepted backups to off-server S3 storage.

For major PostgreSQL upgrades, never change only the image major tag. Use a
tested `pg_dump`/`pg_restore` or `pg_upgrade` procedure.
