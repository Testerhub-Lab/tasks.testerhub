#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /path/to/backup-generation-dir" >&2
  exit 1
fi

backup_dir="$(readlink -f "$1")"
if [ ! -d "$backup_dir" ]; then
  echo "Backup directory not found: ${backup_dir}" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
web_container="${PULSAR_WEB_CONTAINER:-pulsar-prod-web-1}"
web_image="$(docker inspect --format '{{.Image}}' "$web_container")"
backup_name="$(basename "$backup_dir")"
env_file="${PULSAR_APP_ENV_FILE:-/srv/tasks/.env}"

if [ ! -f "$env_file" ]; then
  echo "App env file not found: ${env_file}" >&2
  exit 1
fi

docker_args=(
  --rm
  --env-file "$env_file"
  --env "PULSAR_BACKUP_NAME=${backup_name}"
  --env "PULSAR_BACKUP_S3_PREFIX=${PULSAR_BACKUP_S3_PREFIX:-backups/postgres}"
  --env "PULSAR_BACKUP_KEEP_DAILY=${PULSAR_BACKUP_KEEP_DAILY:-14}"
  --env "PULSAR_BACKUP_KEEP_WEEKLY=${PULSAR_BACKUP_KEEP_WEEKLY:-8}"
  --env "PULSAR_BACKUP_KEEP_MONTHLY=${PULSAR_BACKUP_KEEP_MONTHLY:-6}"
  --env "PULSAR_BACKUP_RETENTION_DRY_RUN=${PULSAR_BACKUP_RETENTION_DRY_RUN:-0}"
)

if [ "${PULSAR_BACKUP_S3_BUCKET:-}" != "" ]; then
  docker_args+=(--env "PULSAR_BACKUP_S3_BUCKET=${PULSAR_BACKUP_S3_BUCKET}")
fi
if [ "${BACKUP_S3_BUCKET:-}" != "" ]; then
  docker_args+=(--env "BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET}")
fi

docker run \
  "${docker_args[@]}" \
  --volume "${repo_root}/infra/production/backup/s3-upload.mjs:/app/s3-upload.mjs:ro" \
  --volume "${backup_dir}:/backup:ro" \
  --workdir /app \
  --entrypoint node \
  "$web_image" \
  /app/s3-upload.mjs upload-and-retain /backup
