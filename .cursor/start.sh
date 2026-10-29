#!/usr/bin/env bash
# Per-boot services. Matchstick tests need PostgreSQL 14 accepting connections.
set -euo pipefail

if ! pg_isready -q; then
  sudo pg_ctlcluster 14 main start
fi

for _ in $(seq 1 30); do
  if pg_isready -q; then
    exit 0
  fi
  sleep 1
done

echo "PostgreSQL 14 did not become ready" >&2
exit 1
