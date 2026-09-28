#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")/.."
mkdir -p backups
output="backups/apaas-mes-$(date -u +%Y%m%dT%H%M%SZ).dump"
temporary="$output.partial"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
docker compose --env-file .env -f deploy/compose.production.yaml exec -T db pg_dump -U mes -Fc mes > "$temporary"
test -s "$temporary"
mv "$temporary" "$output"
trap - EXIT HUP INT TERM
echo "$output"
