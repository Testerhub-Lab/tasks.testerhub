#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 status|retention|upload|upload-and-retain|download-latest [path]" >&2
  exit 1
fi

command="$1"
target="${2:-}"
repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
web_container="${PULSAR_WEB_CONTAINER:-pulsar-prod-web-1}"
web_image="$(docker inspect --format '{{.Image}}' "$web_container")"
env_file="${PULSAR_APP_ENV_FILE:-/srv/tasks/.env}"

if [ ! -f "$env_file" ]; then
  echo "App env file not found: ${env_file}" >&2
  exit 1
fi

docker_args=(
  --rm
  --env-file "$env_file"
  --env "PULSAR_BACKUP_S3_PREFIX=${PULSAR_BACKUP_S3_PREFIX:-backups/postgres}"
  --env "PULSAR_BACKUP_KEEP_DAILY=${PULSAR_BACKUP_KEEP_DAILY:-14}"
  --env "PULSAR_BACKUP_KEEP_WEEKLY=${PULSAR_BACKUP_KEEP_WEEKLY:-8}"
  --env "PULSAR_BACKUP_KEEP_MONTHLY=${PULSAR_BACKUP_KEEP_MONTHLY:-6}"
  --env "PULSAR_BACKUP_RETENTION_DRY_RUN=${PULSAR_BACKUP_RETENTION_DRY_RUN:-0}"
  --volume "${repo_root}/infra/production/backup/s3-upload.mjs:/app/s3-upload.mjs:ro"
  --workdir /app
  --entrypoint node
)

if [ "${PULSAR_BACKUP_S3_BUCKET:-}" != "" ]; then
  docker_args+=(--env "PULSAR_BACKUP_S3_BUCKET=${PULSAR_BACKUP_S3_BUCKET}")
fi
if [ "${BACKUP_S3_BUCKET:-}" != "" ]; then
  docker_args+=(--env "BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET}")
fi

case "$command" in
  upload|upload-and-retain)
    if [ "$target" = "" ]; then
      echo "Backup directory is required for ${command}" >&2
      exit 1
    fi
    backup_dir="$(readlink -f "$target")"
    if [ ! -d "$backup_dir" ]; then
      echo "Backup directory not found: ${backup_dir}" >&2
      exit 1
    fi
    docker_args+=(
      --env "PULSAR_BACKUP_NAME=$(basename "$backup_dir")"
      --volume "${backup_dir}:/backup:ro"
    )
    docker run "${docker_args[@]}" "$web_image" /app/s3-upload.mjs "$command" /backup
    ;;
  retention|status)
    docker run "${docker_args[@]}" "$web_image" /app/s3-upload.mjs "$command"
    ;;
  download-latest)
    if [ "$target" = "" ]; then
      echo "Download target directory is required for ${command}" >&2
      exit 1
    fi
    mkdir -p "$target"
    chmod 700 "$target"
    download_root="$(readlink -f "$target")"
    docker_args+=(
      --user "$(id -u):$(id -g)"
      --volume "${download_root}:${download_root}:rw"
    )
    docker run "${docker_args[@]}" "$web_image" /app/s3-upload.mjs "$command" "$download_root"
    ;;
  *)
    echo "Unknown command: ${command}" >&2
    exit 1
    ;;
esac
