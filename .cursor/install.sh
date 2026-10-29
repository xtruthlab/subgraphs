#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap. Installs toolchains and dependencies, then exits.
# Long-running services belong in .cursor/start.sh.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -Eq '^v22\.'; then
  NODE_VERSION=22.23.4
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    | sudo tar -xJ -C /usr/local --strip-components=1 --no-same-owner
fi

if ! command -v yarn >/dev/null 2>&1; then
  sudo npm install -g yarn@1.22.22
fi

if ! command -v pg_lsclusters >/dev/null 2>&1 || ! pg_lsclusters | awk 'NR>1 {print $1}' | grep -qx '14'; then
  sudo apt-get update -qq
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -d /usr/share/postgresql-common/pgdg
  sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y postgresql-14 postgresql-client-14 libpq5 libpq-dev
fi

# graph-cli 0.67 only downloads Matchstick for Ubuntu 22. The 0.6.0 linux-22
# binary runs on Ubuntu 24 when libpq is installed (matches matchstick-as 0.6.0).
if ! command -v matchstick >/dev/null 2>&1 || ! matchstick --version 2>/dev/null | grep -q '0.6.0'; then
  sudo curl -fsSL -o /usr/local/bin/matchstick \
    https://github.com/LimeChain/matchstick/releases/download/0.6.0/binary-linux-22
  sudo chmod 755 /usr/local/bin/matchstick
fi

yarn install --frozen-lockfile
