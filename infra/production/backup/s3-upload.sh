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
exec "${repo_root}/infra/production/backup/s3-command.sh" upload-and-retain "$backup_dir"
