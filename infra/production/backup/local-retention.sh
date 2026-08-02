#!/usr/bin/env bash
set -euo pipefail

backup_root="${PULSAR_BACKUP_ROOT:-/home/deploy/pulsar-pg18-backups}"
keep_local="${PULSAR_BACKUP_KEEP_LOCAL:-7}"

if ! [[ "$keep_local" =~ ^[0-9]+$ ]]; then
  echo "PULSAR_BACKUP_KEEP_LOCAL must be a non-negative integer" >&2
  exit 1
fi

backup_root="$(readlink -f "$backup_root")"
if [ ! -d "$backup_root" ]; then
  printf '{"backupRoot":"%s","generationsSeen":0,"generationsKept":0,"generationsDeleted":0,"keepLocal":%s}\n' \
    "$backup_root" \
    "$keep_local"
  exit 0
fi

case "$backup_root" in
  ""|"/"|"/home"|"/home/deploy")
    echo "Refusing unsafe backup root: ${backup_root}" >&2
    exit 1
    ;;
esac

mapfile -t generations < <(
  find "$backup_root" \
    -mindepth 1 \
    -maxdepth 1 \
    -type d \
    -regextype posix-extended \
    -regex '.*/[0-9]{8}T[0-9]{6}Z' \
    -printf '%f\n' |
    sort -r
)

deleted=0
for index in "${!generations[@]}"; do
  if [ "$index" -lt "$keep_local" ]; then
    continue
  fi

  generation="${generations[$index]}"
  target="${backup_root}/${generation}"
  resolved_target="$(readlink -f "$target")"
  if [ "$(dirname "$resolved_target")" != "$backup_root" ]; then
    echo "Refusing unsafe backup generation path: ${resolved_target}" >&2
    exit 1
  fi

  rm -rf -- "$resolved_target"
  deleted=$((deleted + 1))
done

seen="${#generations[@]}"
kept="$seen"
if [ "$kept" -gt "$keep_local" ]; then
  kept="$keep_local"
fi

printf '{"backupRoot":"%s","generationsSeen":%s,"generationsKept":%s,"generationsDeleted":%s,"keepLocal":%s}\n' \
  "$backup_root" \
  "$seen" \
  "$kept" \
  "$deleted" \
  "$keep_local"
