#!/bin/bash
# Step 0 gate runner: brings up the pgvector container and runs the smoke SQL.
# Usage: ./scripts/pgvector-smoke.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo ">> Starting postgres (pgvector) service..."
docker compose up -d postgres

echo ">> Waiting for postgres to be healthy..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U resume -d resume_rag >/dev/null 2>&1; then
    echo ">> postgres is ready."
    break
  fi
  sleep 2
  if [ "$i" -eq 30 ]; then echo "!! postgres did not become ready in time"; exit 1; fi
done

echo ">> Running pgvector smoke SQL..."
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U resume -d resume_rag \
  < scripts/pgvector-smoke.sql

echo ">> Step 0 gate complete."
