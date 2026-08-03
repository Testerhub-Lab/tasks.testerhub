#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)

compose_project=${PULSAR_COMPOSE_PROJECT:-pulsar-prod}
env_file=${PULSAR_PRODUCTION_ENV_FILE:-/srv/tasks/production.env}
compose_file=$repo_root/infra/production/compose.yml

if [ ! -f "$env_file" ]; then
  echo "Production env file not found: $env_file" >&2
  exit 1
fi

cd "$repo_root"

compose() {
  docker compose \
    -p "$compose_project" \
    --env-file "$env_file" \
    -f "$compose_file" \
    "$@"
}

echo "Validating production compose model..."
compose config --quiet

echo "Building web image..."
compose build web

echo "Recreating web from production compose..."
compose up -d --force-recreate --no-deps web

web_container="${compose_project}-web-1"
data_network="${compose_project}_data"

echo "Checking web runtime contract..."
docker exec "$web_container" sh -lc '
  test "$PULSAR_AUTH_STORE" = "zero"
  test -n "$DATABASE_URL"
  test -n "$ZERO_UPSTREAM_DB"
'

if ! docker inspect "$web_container" \
  --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' |
  grep -Fx "$data_network" >/dev/null; then
  echo "Web container is not attached to required network: $data_network" >&2
  exit 1
fi

echo "Production web runtime contract is valid."
compose ps

