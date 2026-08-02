#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
restore_root="${PULSAR_RESTORE_DRILL_ROOT:-/home/deploy/pulsar-pg18-restore-drills}"
keep_local="${PULSAR_RESTORE_DRILL_KEEP_LOCAL:-3}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
download_root="${restore_root}/s3-restore-${timestamp}"

mkdir -p "$download_root"
chmod 700 "$restore_root" "$download_root"

download_output="$("${script_dir}/s3-command.sh" download-latest "$download_root")"
dump_file="$(
  DOWNLOAD_OUTPUT="$download_output" python3 - <<'PY'
import json
import os
print(json.loads(os.environ["DOWNLOAD_OUTPUT"])["download"]["dumpFile"])
PY
)"
restore_output="$("${script_dir}/restore-check.sh" "$dump_file")"

if [[ "$keep_local" =~ ^[0-9]+$ ]]; then
  mapfile -t drills < <(
    find "$restore_root" \
      -mindepth 1 \
      -maxdepth 1 \
      -type d \
      -name 's3-restore-*' \
      -printf '%f\n' |
      sort -r
  )
  for index in "${!drills[@]}"; do
    if [ "$index" -lt "$keep_local" ]; then
      continue
    fi
    rm -rf -- "${restore_root}/${drills[$index]}"
  done
fi

printf '{"download":%s,"restore":%s}\n' \
  "$download_output" \
  "$restore_output"
