#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /path/to/pulsar-pg18-YYYYMMDDTHHMMSSZ.dump" >&2
  exit 1
fi

dump_file="$1"
if [ ! -f "$dump_file" ]; then
  echo "Dump file not found: ${dump_file}" >&2
  exit 1
fi

restore_image="${PULSAR_RESTORE_IMAGE:-postgres:18.4-trixie}"
restore_db="${PULSAR_RESTORE_DB:-pulsar_restore}"
restore_user="${PULSAR_RESTORE_USER:-postgres}"
required_tables="${PULSAR_RESTORE_REQUIRED_TABLES:-users workspaces projects issues comments wiki_pages wiki_page_revisions issue_wiki_links api_tokens}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
safe_base="$(basename "$dump_file" .dump | tr -c '[:alnum:]_.-' '-')"
container="${PULSAR_RESTORE_CONTAINER:-pulsar-restore-check-${timestamp}}"
result_dir="${PULSAR_RESTORE_RESULT_DIR:-$(dirname "$dump_file")/restore-check-${safe_base}-${timestamp}}"
counts_file="${result_dir}/row-counts.tsv"
summary_file="${result_dir}/summary.json"
restore_password="restore-check-${timestamp}"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p "$result_dir"
chmod 700 "$result_dir"

checksum_file="${dump_file}.sha256"
if [ -f "$checksum_file" ]; then
  (
    cd "$(dirname "$dump_file")"
    sha256sum -c "$(basename "$checksum_file")"
  ) >/dev/null
fi

docker run \
  --detach \
  --rm \
  --name "$container" \
  --network none \
  --env "POSTGRES_DB=${restore_db}" \
  --env "POSTGRES_PASSWORD=${restore_password}" \
  "$restore_image" >/dev/null

ready=0
for _ in $(seq 1 60); do
  if docker exec "$container" pg_isready --username "$restore_user" --dbname "$restore_db" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "Disposable PostgreSQL did not become ready: ${container}" >&2
  exit 1
fi

docker cp "$dump_file" "${container}:/tmp/restore.dump"
docker exec "$container" \
  pg_restore \
    --username "$restore_user" \
    --dbname "$restore_db" \
    --no-owner \
    --no-privileges \
    /tmp/restore.dump

count_sql="$(
  docker exec "$container" \
    psql \
      --username "$restore_user" \
      --dbname "$restore_db" \
      --tuples-only \
      --no-align \
      --command "
        SELECT string_agg(
          format(
            'SELECT %L AS table_name, count(*)::bigint AS row_count FROM %I.%I',
            schemaname || '.' || tablename,
            schemaname,
            tablename
          ),
          ' UNION ALL '
          ORDER BY schemaname, tablename
        )
        FROM pg_tables
        WHERE schemaname = 'public';
      "
)"
if [ -n "$count_sql" ]; then
  docker exec "$container" \
    psql \
      --username "$restore_user" \
      --dbname "$restore_db" \
      --tuples-only \
      --no-align \
      --field-separator $'\t' \
      --command "${count_sql} ORDER BY 1;" > "$counts_file"
else
  : > "$counts_file"
fi
chmod 600 "$counts_file"

for table_name in $required_tables; do
  if ! docker exec "$container" \
    psql \
      --username "$restore_user" \
      --dbname "$restore_db" \
      --tuples-only \
      --no-align \
      --command "SELECT to_regclass('public.${table_name}') IS NOT NULL;" |
    grep -qx 't'; then
    echo "Required table is missing after restore: public.${table_name}" >&2
    exit 1
  fi
done

table_count="$(wc -l < "$counts_file" | tr -d ' ')"
dump_bytes="$(wc -c < "$dump_file" | tr -d ' ')"
dump_sha256="$(sha256sum "$dump_file" | awk '{print $1}')"

cat > "$summary_file" <<EOF
{
  "checkedAt": "${timestamp}",
  "dumpFile": "${dump_file}",
  "dumpBytes": ${dump_bytes},
  "dumpSha256": "${dump_sha256}",
  "restoreImage": "${restore_image}",
  "restoreContainer": "${container}",
  "restoreDatabase": "${restore_db}",
  "tablesVerified": ${table_count},
  "requiredTables": "$(printf '%s' "$required_tables")",
  "rowCountsFile": "${counts_file}"
}
EOF
chmod 600 "$summary_file"

printf '{"dumpFile":"%s","dumpBytes":%s,"dumpSha256":"%s","tablesVerified":%s,"summaryFile":"%s"}\n' \
  "$dump_file" \
  "$dump_bytes" \
  "$dump_sha256" \
  "$table_count" \
  "$summary_file"
