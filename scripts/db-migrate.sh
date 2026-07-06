#!/bin/bash
# Applies every migrations/*.sql in filename order against the local pgvector container.
# Idempotent migrations (create ... if not exists) make this safe to re-run.
#
# Usage: ./scripts/db-migrate.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo ">> Ensuring postgres is up..."
docker compose up -d postgres >/dev/null
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U resume -d resume_rag >/dev/null 2>&1; then break; fi
  sleep 2
  if [ "$i" -eq 30 ]; then echo "!! postgres did not become ready"; exit 1; fi
done

shopt -s nullglob
files=(migrations/*.sql)
if [ ${#files[@]} -eq 0 ]; then echo "!! no migrations found"; exit 1; fi

for f in "${files[@]}"; do
  echo ">> applying $f"
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U resume -d resume_rag < "$f"
done

echo ">> migrations applied. Current schema:"
docker compose exec -T postgres psql -U resume -d resume_rag -c '\d resume_chunks'
docker compose exec -T postgres psql -U resume -d resume_rag -c '\di resume_chunks*'
