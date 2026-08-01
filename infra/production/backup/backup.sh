#!/usr/bin/env bash
set -euo pipefail

compose_project="${PULSAR_COMPOSE_PROJECT:-pulsar-prod}"
postgres_container="${PULSAR_POSTGRES_CONTAINER:-${compose_project}-postgres-1}"
database="${PULSAR_DB_NAME:-pulsar}"
database_user="${PULSAR_DB_USER:-pulsar_zero}"
backup_root="${PULSAR_BACKUP_ROOT:-/home/deploy/pulsar-pg18-backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${backup_root}/${timestamp}"
dump_name="pulsar-pg18-${timestamp}.dump"
dump_file="${backup_dir}/${dump_name}"
tmp_file="${dump_file}.tmp"
manifest_file="${backup_dir}/manifest.json"

if ! docker inspect "$postgres_container" >/dev/null 2>&1; then
  echo "PostgreSQL container not found: ${postgres_container}" >&2
  exit 1
fi

container_state="$(
  docker inspect \
    --format '{{.State.Status}}' \
    "$postgres_container"
)"
if [ "$container_state" != "running" ]; then
  echo "PostgreSQL container is not running: ${postgres_container} (${container_state})" >&2
  exit 1
fi

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

rm -f "$tmp_file"
docker exec "$postgres_container" \
  pg_dump \
    --username "$database_user" \
    --dbname "$database" \
    --format custom \
    --no-owner \
    --no-privileges > "$tmp_file"

mv "$tmp_file" "$dump_file"
chmod 600 "$dump_file"

(
  cd "$backup_dir"
  sha256sum "$dump_name" > "${dump_name}.sha256"
)
chmod 600 "${dump_file}.sha256"

backup_bytes="$(wc -c < "$dump_file" | tr -d ' ')"
backup_sha256="$(awk '{print $1}' "${dump_file}.sha256")"
git_head="$(git rev-parse --short HEAD 2>/dev/null || true)"

cat > "$manifest_file" <<EOF
{
  "createdAt": "${timestamp}",
  "composeProject": "${compose_project}",
  "postgresContainer": "${postgres_container}",
  "database": "${database}",
  "databaseUser": "${database_user}",
  "dumpFile": "${dump_file}",
  "sha256File": "${dump_file}.sha256",
  "backupBytes": ${backup_bytes},
  "backupSha256": "${backup_sha256}",
  "gitHead": "${git_head}"
}
EOF
chmod 600 "$manifest_file"

printf '{"backupDir":"%s","dumpFile":"%s","backupBytes":%s,"backupSha256":"%s"}\n' \
  "$backup_dir" \
  "$dump_file" \
  "$backup_bytes" \
  "$backup_sha256"
