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

Manual retention is intentional for the first routine version: these scripts do
not delete older backups.

After the routine is accepted, add a separate automation step:

- scheduled daily/weekly backup;
- off-server copy;
- stale-backup alert;
- periodic restore drill;
- explicit retention policy.
