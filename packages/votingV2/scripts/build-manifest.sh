#!/bin/bash
set -euo pipefail

NETWORK=$1

FILE=$NETWORK'.json'

DATA=manifest/data/$FILE

echo 'Generating manifest from data file: '$DATA
cat $DATA

mustache \
  -p manifest/templates/VotingV2.template.yaml \
  -p manifest/templates/Store.template.yaml \
  $DATA \
  manifest/templates/subgraph.template.yaml > subgraph.yaml

mustache \
  $DATA \
  manifest/templates/addresses.template.ts > addresses.ts

# When this network has no Store data source (e.g. xlayer-testnet, where
# the RPC doesn't expose trace_filter so call handlers are unusable),
# graph codegen won't produce generated/Store/Store.ts. The committed
# src/mappings/store.ts imports SetFinalFeeCall from there and will fail
# the AssemblyScript compile. Stub out the mapping so `src/index.ts` keeps
# exporting handleSetFinalFee (manifest just won't reference it). The CI
# job runs on a fresh checkout, so this never leaks back into other
# networks' builds.
HAS_STORE=$(node -e "const d=require('./$DATA'); process.stdout.write(String((d.StoreDataSources||[]).length))")
if [ "$HAS_STORE" = "0" ]; then
  echo "No StoreDataSources for $NETWORK — stubbing src/mappings/store.ts"
  cat > src/mappings/store.ts <<'EOF'
// Stub: Store data source is not configured for this network. The real
// handler relies on call traces (setFinalFee callHandler), which require
// trace_filter — not available on every RPC. We replace the impl with a
// no-op so AssemblyScript still compiles when generated/Store/Store.ts
// is absent. The manifest doesn't list Store as a data source on this
// network, so this handler is never called.
export function handleSetFinalFee(): void {}
EOF
fi
