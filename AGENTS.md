# Agent notes

Yarn 1 workspace (`yarn.lock` v1) of The Graph subgraphs. CI (`.github/workflows/test.yaml`) uses Node 22 on Ubuntu and runs `yarn install` then `yarn ci`. Deploys run from `master` (and `main` if present); day-to-day work is on `dev`.

## Commands

```bash
bash .cursor/install.sh          # Node 22, Yarn 1.22.22, PostgreSQL 14, Matchstick 0.6.0, yarn install --frozen-lockfile
bash .cursor/start.sh            # start PostgreSQL 14 if it is not already accepting connections
yarn prepare-ci                  # generate manifests, codegen, and graph build (the CI compile)
yarn build                       # graph build only; requires subgraph.yaml from prepare-ci or prepare:<network>
yarn ci                          # yarn prepare-ci && yarn test
yarn lint                        # prettier ./**
```

Only `packages/managed-oracle-v2` defines a `test` script. Run it with the Matchstick binary, from that package:

```bash
cd packages/managed-oracle-v2
matchstick -r
```

## Gotchas

- `yarn test` / `graph test` fails on Ubuntu 24. `@graphprotocol/graph-cli` 0.67 downloads Matchstick only for Ubuntu 22 (`Unsupported platform: Linux x64 24`). Use `matchstick` (the 0.6.0 `binary-linux-22` release, installed by `.cursor/install.sh`). PostgreSQL 14 must be running first.
- `yarn lint` exits 2: `prettier ./**` is handed the `scripts/` directory, which has no files Prettier supports (`No supported files were found in the directory: "./scripts"`).
- `subgraph.yaml` and `generated/` are produced by prepare scripts and are gitignored. A fresh checkout cannot `yarn build` until `yarn prepare-ci` (or a package `prepare:<network>`).
- `docker-compose.yml` is an optional local graph-node (Postgres, IPFS, graph-node). Unit tests do not need it. The compose file points Ethereum at `https://testrpc.xlayer.tech/terigon`.
- Deploy scripts read `.env` (see `.env.sample`). Install, build, and tests do not. Names only: `STAGING_KEY`, `STAGING_NAMESPACE`, `PROD_KEY`, `DEPLOY_KEY`, `GOLDSKY_API_KEY`, `INFURA_API_KEY`. Self-hosted deploys also use `GRAPH_NODE_URL` and `IPFS_URL` (defaults `http://127.0.0.1:8020` and `http://127.0.0.1:5001`). Do not commit secret values.
