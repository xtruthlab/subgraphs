# Agent notes

Yarn 1 workspace of The Graph subgraphs. CI (`.github/workflows/test.yaml`) uses Node 22 and Yarn 1 on Ubuntu 22.04. Cloud agents use the commands in `.cursor/environment.json`.

## Install

```bash
bash .cursor/install.sh
```

That installs PostgreSQL when `psql` is missing, runs `yarn install --frozen-lockfile`, and patches `@graphprotocol/graph-cli` 0.67 so Matchstick's Ubuntu 22 binary is accepted on Ubuntu 24. Re-run the script after a fresh `yarn install`; the patch lives in `node_modules`.

## Build

```bash
yarn prepare-ci
```

`prepare-ci` writes each package's gitignored `subgraph.yaml`, then runs codegen and `graph build` for the six packages CI covers. `yarn build` compiles those same packages and needs the manifests to exist already.

## Test

```bash
bash .cursor/start.sh
yarn test
```

Matchstick needs a running PostgreSQL and an `ubuntu` superuser. `start.sh` provides both. Only `packages/managed-oracle-v2` defines a `test` script, so `yarn test` runs that package.

The current suite compiles and executes. 10 tests pass. 4 assertions fail in `packages/managed-oracle-v2/tests/managed-oracle-v2/managedOracle.test.ts`: custom-bond currency mismatch, and the three dual-ABI `getRequest` cases. Those failures are in the mappings/tests.

Without the Ubuntu 24 patch, `graph test` exits immediately with `Unsupported platform: Linux x64 24`.

## Lint

```bash
yarn lint
```

`yarn lint` is `prettier ./**`. It exits 2 because that glob includes directories such as `scripts/`, which contain no files Prettier supports.

```bash
yarn prettier --check .
```

This is the check that reports formatting. It currently exits 1 with style issues in 70 files. `.prettierrc.json` sets `explicitTypes`, which Prettier 2 ignores.

## Deploy

Build and test do not need secrets. Deploy scripts (see `.env.sample` and `scripts/deploy.sh`) read these names when publishing:

- `STAGING_KEY`
- `STAGING_NAMESPACE`
- `PROD_KEY`
- `DEPLOY_KEY`
- `GOLDSKY_API_KEY`
- `INFURA_API_KEY`
- `GRAPH_NODE_URL`
- `IPFS_URL`
- `NAMESPACE`
- `VERSION_LABEL`

`docker-compose.yml` can start a local graph-node. It is not required for install, build, or test.
