#!/usr/bin/env bash
set -euo pipefail
[ ! -d '/agent/repos/subgraphs' ] || cd '/agent/repos/subgraphs' || exit $?

if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib libpq-dev
fi

yarn install --frozen-lockfile

# graph-cli 0.67.3 only selects Matchstick's binary-linux-22 build on Ubuntu 22.
# That binary runs on Ubuntu 24 (the Cloud Agent default image).
python3 - <<'PY'
from pathlib import Path

needle = "if (type === 'Linux' && majorVersion === 22) {"
patched = "if (type === 'Linux' && (majorVersion === 22 || majorVersion === 24)) {"
paths = [Path("node_modules/@graphprotocol/graph-cli/dist/commands/test.js")]
paths.extend(Path("packages").glob("*/node_modules/@graphprotocol/graph-cli/dist/commands/test.js"))
found = False
for path in paths:
    if not path.is_file():
        continue
    found = True
    text = path.read_text()
    if patched in text:
        continue
    if needle not in text:
        raise SystemExit(f"Matchstick platform check not found in {path}")
    path.write_text(text.replace(needle, patched, 1))
if not found:
    raise SystemExit("graph-cli test command was not installed")
PY
