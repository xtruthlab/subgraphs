#!/usr/bin/env bash
set -euo pipefail
[ ! -d '/agent/repos/subgraphs' ] || cd '/agent/repos/subgraphs' || exit $?

if ! pg_isready -q; then
  sudo service postgresql start
fi

ready=0
for _ in $(seq 1 30); do
  if pg_isready -q; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "PostgreSQL did not become ready" >&2
  exit 1
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'ubuntu'" | grep -q 1; then
  sudo -u postgres createuser -s ubuntu
fi
