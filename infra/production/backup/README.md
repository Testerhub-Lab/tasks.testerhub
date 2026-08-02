# Pulsar production backup routine

This directory contains the manual backup and restore-check routine for the
current Pulsar production PostgreSQL 18 database.

Scope:

- Compose project: `pulsar-prod`
- Database container: `pulsar-prod-postgres-1`
- Database: `pulsar`
- Default backup directory: `/home/deploy/pulsar-pg18-backups`

The scripts do not print database passwords, connection strings, dump contents,
or application secrets.

## Create a backup

Run from `/home/deploy/tasks-source` on the production server:

```bash
infra/production/backup/backup.sh
```

The script creates:

- `pulsar-pg18-<timestamp>.dump` — custom-format `pg_dump -Fc`;
- `pulsar-pg18-<timestamp>.dump.sha256` — SHA-256 checksum;
- `manifest.json` — non-secret metadata.

Override the backup root only when needed:

```bash
PULSAR_BACKUP_ROOT=/home/deploy/pulsar-pg18-backups \
  infra/production/backup/backup.sh
```

## Verify a backup by restoring it

Run the restore drill against a dump:

```bash
infra/production/backup/restore-check.sh \
  /home/deploy/pulsar-pg18-backups/<timestamp>/pulsar-pg18-<timestamp>.dump
```

The script:

1. Verifies the adjacent `.sha256` file when present.
2. Starts a disposable PostgreSQL 18 container with no published ports and no
   network access.
3. Restores the dump with `pg_restore`.
4. Verifies required application tables exist.
5. Writes row-count estimates and a non-secret summary JSON next to the dump.
6. Removes the disposable container on exit.

## Acceptance criteria for a manual backup

A backup is accepted only when:

- `backup.sh` exits with code `0`;
- `restore-check.sh` exits with code `0`;
- the dump and checksum are stored outside the Docker volume;
- the accepted dump is copied off the server or explicitly queued for off-server
  copy;
- the PULSAR issue or operator log records only path, size, checksum, and restore
  summary — never secret values.

## Retention and automation

Manual retention is intentionally conservative in `backup.sh` and
`restore-check.sh`: they do not delete older backups.

Use the S3 automation wrapper after the manual routine is accepted:

```bash
infra/production/backup/backup-and-upload.sh
```

It creates a backup, runs restore-check, uploads the whole backup generation to
S3, applies retention under the configured backup prefix, and then removes stale
local backup generations from the server.

Required env comes from `/srv/tasks/.env` by default:

- `S3_ENDPOINT`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `S3_FORCE_PATH_STYLE`

Optional backup-specific env:

- `PULSAR_BACKUP_S3_BUCKET` — use a dedicated bucket; falls back to `S3_BUCKET`;
- `PULSAR_BACKUP_S3_PREFIX` — default `backups/postgres`;
- `PULSAR_BACKUP_KEEP_DAILY` — default `14`;
- `PULSAR_BACKUP_KEEP_WEEKLY` — default `8`;
- `PULSAR_BACKUP_KEEP_MONTHLY` — default `6`;
- `PULSAR_BACKUP_KEEP_LOCAL` — local server generations to keep, default `7`;
- `PULSAR_BACKUP_RETENTION_DRY_RUN=1` — list retention impact without deleting.

Install the deploy-user cron entry:

```bash
infra/production/backup/install-cron.sh
```

Default schedule is daily at `03:17` server time:

```text
17 3 * * *
```

Override if needed:

```bash
PULSAR_BACKUP_CRON_SCHEDULE="17 3 * * *" \
  infra/production/backup/install-cron.sh
```

The cron installer manages only the block between:

```text
# BEGIN PULSAR PG18 BACKUP
# END PULSAR PG18 BACKUP
```

Current retention deletes only objects under `PULSAR_BACKUP_S3_PREFIX` and only
whole timestamped backup generations (`YYYYMMDDTHHMMSSZ`). Local retention
uses the same timestamped-generation rule and refuses broad roots such as `/`,
`/home`, or `/home/deploy`.
