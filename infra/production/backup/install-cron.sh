#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
schedule="${PULSAR_BACKUP_CRON_SCHEDULE:-17 3 * * *}"
log_file="${PULSAR_BACKUP_LOG_FILE:-/home/deploy/pulsar-pg18-backups/backup-cron.log}"
marker_start="# BEGIN PULSAR PG18 BACKUP"
marker_end="# END PULSAR PG18 BACKUP"
job="${schedule} cd ${repo_root} && infra/production/backup/backup-and-upload.sh >> ${log_file} 2>&1"

current="$(crontab -l 2>/dev/null || true)"
filtered="$(
  printf '%s\n' "$current" |
    awk -v start="$marker_start" -v end="$marker_end" '
      $0 == start { skip = 1; next }
      $0 == end { skip = 0; next }
      skip != 1 { print }
    '
)"

{
  printf '%s\n' "$filtered" | sed '/^[[:space:]]*$/d'
  printf '%s\n%s\n%s\n' "$marker_start" "$job" "$marker_end"
} | crontab -

printf '{"installed":true,"schedule":"%s","logFile":"%s"}\n' "$schedule" "$log_file"
