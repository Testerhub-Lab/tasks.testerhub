#!/bin/sh
set -eu

if [ -z "${PULSAR_APP_DB_PASSWORD:-}" ]; then
  echo "PULSAR_APP_DB_PASSWORD is required" >&2
  exit 1
fi

psql \
  --username "$POSTGRES_USER" \
  --dbname postgres \
  --set=ON_ERROR_STOP=1 \
  --set=app_password="$PULSAR_APP_DB_PASSWORD" \
  --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format(
  'CREATE ROLE pulsar_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pulsar_app')
\gexec

SELECT format('ALTER ROLE pulsar_app PASSWORD %L', :'app_password')
\gexec

SELECT format('ALTER DATABASE %I OWNER TO pulsar_app', :'database_name')
\gexec
SQL

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO pulsar_app;
SQL

