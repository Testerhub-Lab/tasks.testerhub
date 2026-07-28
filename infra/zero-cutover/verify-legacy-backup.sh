#!/bin/sh
set -eu

source_db="${CUTOVER_SOURCE_DB:-pulsar_app}"
restore_db="${CUTOVER_RESTORE_DB:-pulsar_cutover_restore}"
PGUSER="${CUTOVER_DB_USER:-${POSTGRES_USER:-pulsar_zero}}"
export PGUSER
backup_file="/tmp/pulsar-cutover-legacy.dump"
source_schema="/tmp/pulsar-cutover-source-schema.sql"
restore_schema="/tmp/pulsar-cutover-restore-schema.sql"
source_counts_before="/tmp/pulsar-cutover-source-counts-before.txt"
source_counts_after="/tmp/pulsar-cutover-source-counts-after.txt"
restore_counts="/tmp/pulsar-cutover-restore-counts.txt"

case "$restore_db" in
  pulsar_cutover_restore*) ;;
  *)
    echo "CUTOVER_RESTORE_DB must start with pulsar_cutover_restore" >&2
    exit 1
    ;;
esac

if [ "$source_db" = "$restore_db" ]; then
  echo "source and restore databases must differ" >&2
  exit 1
fi

cleanup() {
  dropdb --if-exists "$restore_db" >/dev/null 2>&1 || true
  rm -f \
    "$backup_file" \
    "$source_schema" \
    "$restore_schema" \
    "$source_counts_before" \
    "$source_counts_after" \
    "$restore_counts"
}
trap cleanup EXIT

write_counts() {
  database="$1"
  output="$2"
  count_sql="$(
    psql --dbname "$database" --tuples-only --no-align --command "
      SELECT string_agg(
        format(
          'SELECT %L AS table_name, count(*)::bigint AS row_count FROM %I.%I',
          schemaname || '.' || tablename,
          schemaname,
          tablename
        ),
        ' UNION ALL '
        ORDER BY tablename
      )
      FROM pg_tables
      WHERE schemaname = 'public';
    "
  )"

  if [ -z "$count_sql" ]; then
    : > "$output"
    return
  fi

  psql \
    --dbname "$database" \
    --tuples-only \
    --no-align \
    --field-separator '|' \
    --command "$count_sql ORDER BY 1;" > "$output"
}

cleanup
write_counts "$source_db" "$source_counts_before"

pg_dump \
  --dbname "$source_db" \
  --format custom \
  --no-owner \
  --no-privileges \
  --file "$backup_file"

pg_dump \
  --dbname "$source_db" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --file "$source_schema"

backup_sha256="$(sha256sum "$backup_file" | awk '{print $1}')"
backup_bytes="$(wc -c < "$backup_file" | tr -d ' ')"

createdb "$restore_db"
pg_restore \
  --dbname "$restore_db" \
  --no-owner \
  --no-privileges \
  "$backup_file"

pg_dump \
  --dbname "$restore_db" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --file "$restore_schema"

# PostgreSQL 18 emits a fresh random psql \restrict token for every plain dump.
# It is not part of the database schema, so remove it only from comparison files.
sed -i '/^\\restrict /d; /^\\unrestrict /d' "$source_schema" "$restore_schema"

write_counts "$source_db" "$source_counts_after"
write_counts "$restore_db" "$restore_counts"

diff -u "$source_schema" "$restore_schema"
diff -u "$source_counts_before" "$source_counts_after"
diff -u "$source_counts_before" "$restore_counts"

table_count="$(wc -l < "$source_counts_before" | tr -d ' ')"
printf '{"backupBytes":%s,"backupSha256":"%s","restoreDatabase":"%s","tablesVerified":%s}\n' \
  "$backup_bytes" \
  "$backup_sha256" \
  "$restore_db" \
  "$table_count"
