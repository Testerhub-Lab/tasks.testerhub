#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
backup_root="${PULSAR_BACKUP_ROOT:-/home/deploy/pulsar-pg18-backups}"
max_age_hours="${PULSAR_BACKUP_MAX_AGE_HOURS:-36}"
s3_status="$("${script_dir}/s3-command.sh" status)"

BACKUP_ROOT="$backup_root" \
MAX_AGE_HOURS="$max_age_hours" \
S3_STATUS="$s3_status" \
python3 - <<'PY'
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

backup_root = Path(os.environ["BACKUP_ROOT"])
max_age_hours = int(os.environ["MAX_AGE_HOURS"])
s3_status = json.loads(os.environ["S3_STATUS"])["status"]
now = datetime.now(timezone.utc)

cron_text = ""
cron_available = False
try:
    cron = subprocess.run(
        ["crontab", "-l"],
        check=False,
        capture_output=True,
        text=True,
    )
    cron_available = cron.returncode == 0
    cron_text = cron.stdout
except FileNotFoundError:
    cron_available = False

cron_present = (
    "# BEGIN PULSAR PG18 BACKUP" in cron_text
    and "# END PULSAR PG18 BACKUP" in cron_text
    and "backup-and-upload.sh" in cron_text
)

generation_pattern = re.compile(r"^\d{8}T\d{6}Z$")
generations = sorted(
    [path for path in backup_root.iterdir() if path.is_dir() and generation_pattern.match(path.name)],
    key=lambda path: path.name,
    reverse=True,
) if backup_root.exists() else []

latest = None
local_ok = False
if generations:
    latest_path = generations[0]
    created_at = datetime.strptime(latest_path.name, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    age_hours = (now - created_at).total_seconds() / 3600
    dump_files = sorted(latest_path.glob("pulsar-pg18-*.dump"))
    sha_files = sorted(latest_path.glob("pulsar-pg18-*.dump.sha256"))
    manifest = latest_path / "manifest.json"
    restore_summaries = sorted(latest_path.glob("restore-check-*/summary.json"))
    local_ok = (
        age_hours <= max_age_hours
        and len(dump_files) == 1
        and len(sha_files) == 1
        and manifest.is_file()
        and len(restore_summaries) >= 1
    )
    latest = {
        "name": latest_path.name,
        "path": str(latest_path),
        "ageHours": round(age_hours, 3),
        "hasDump": len(dump_files) == 1,
        "hasSha256": len(sha_files) == 1,
        "hasManifest": manifest.is_file(),
        "hasRestoreSummary": len(restore_summaries) >= 1,
    }

s3_latest = s3_status.get("latestGeneration")
s3_latest_complete = s3_latest is not None and s3_latest.get("complete") is True
ok = cron_present and local_ok and s3_latest_complete
result = {
    "ok": ok,
    "checkedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "maxAgeHours": max_age_hours,
    "cron": {
        "available": cron_available,
        "present": cron_present,
    },
    "local": {
        "backupRoot": str(backup_root),
        "generationsSeen": len(generations),
        "latest": latest,
        "ok": local_ok,
    },
    "s3": {
        "bucket": s3_status.get("bucket"),
        "prefix": s3_status.get("prefix"),
        "generationsSeen": s3_status.get("generationsSeen"),
        "objectsSeen": s3_status.get("objectsSeen"),
        "latestGeneration": s3_latest,
        "ok": s3_latest_complete,
    },
}
print(json.dumps(result, separators=(",", ":")))
sys.exit(0 if ok else 1)
PY
