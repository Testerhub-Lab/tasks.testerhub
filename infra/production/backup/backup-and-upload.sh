#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
backup_output="$("${script_dir}/backup.sh")"
backup_dir="$(
  BACKUP_OUTPUT="$backup_output" python3 - <<'PY'
import json
import os
print(json.loads(os.environ["BACKUP_OUTPUT"])["backupDir"])
PY
)"
dump_file="$(
  BACKUP_OUTPUT="$backup_output" python3 - <<'PY'
import json
import os
print(json.loads(os.environ["BACKUP_OUTPUT"])["dumpFile"])
PY
)"

restore_output="$("${script_dir}/restore-check.sh" "$dump_file")"
s3_output="$("${script_dir}/s3-upload.sh" "$backup_dir")"

printf '{"backup":%s,"restore":%s,"s3":%s}\n' \
  "$backup_output" \
  "$restore_output" \
  "$s3_output"
