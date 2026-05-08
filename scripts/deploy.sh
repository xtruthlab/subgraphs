#!/bin/bash
# Tolerate a missing .env when deploying to a self-hosted graph-node (DOCKER mode).
[ -f ../../.env ] && export $(cat ../../.env | xargs)

NETWORK=$1
SUBGRAPH_NAME=$SUBGRAPH_NAME

if [[ "$STAGING" && -z "${STAGING_NAMESPACE}" ]]; then
    echo >&2 "STAGING_NAMESPACE not defined in .env. This should be the github username for the staging namespace"
    exit 1
fi

if [ "$STAGING" ]; then
    NAMESPACE=$STAGING_NAMESPACE
else
    # Self-hosted DOCKER deploys go under the xtruth namespace; the previous
    # default (umaprotocol) was carried over from upstream and didn't match
    # the project. Override with NAMESPACE=foo if you want something else.
    NAMESPACE="${NAMESPACE:-xtruth}"
fi

if [ "$STAGING" ]; then
    API_KEY=$STAGING_KEY
else
    API_KEY=$PROD_KEY
fi

# Require $API_KEY for hosted/studio deploys, but skip for self-hosted DOCKER mode.
if [[ -z "${API_KEY}" && -z "${DOCKER}" ]]; then
    echo >&2 "STAGING_KEY or PROD_KEY not defined in .env. This should be the access token for the $NAMESPACE graph namespace"
    exit 1
fi

# Graph studio deploy key
DEPLOY_KEY=$DEPLOY_KEY

# Require $DEPLOY_KEY to be set if $STUDIO is set
if [[ "$STUDIO" && -z "${DEPLOY_KEY}" ]]; then
    echo >&2 "DEPLOY_KEY not defined in .env. This should be the deploy key for the graph studio"
    exit 1
fi

# Check if goldsky is installed when using Goldsky indexer.
if [ "$GOLDSKY" ] && ! command -v goldsky >/dev/null 2>&1; then
    echo "Error: goldsky command not available. Install it with: curl https://goldsky.com | sh"
    exit 1
fi

# Default values for GRAPH_NODE and IPFS
GRAPH_NODE="${GRAPH_NODE:-https://api.thegraph.com/deploy/}"
IPFS="${IPFS:-https://api.thegraph.com/ipfs/}"

echo "$NAMESPACE/$SUBGRAPH_NAME"
if [ "$DOCKER" ]; then
    # Allow targeting a remote graph-node + IPFS via env vars (default to local).
    GRAPH_NODE_URL="${GRAPH_NODE_URL:-http://127.0.0.1:8020}"
    IPFS_URL="${IPFS_URL:-http://127.0.0.1:5001}"
    echo "Deploying to docker graph-node at $GRAPH_NODE_URL (IPFS: $IPFS_URL)"
    VERSION_LABEL="${VERSION_LABEL:-v0.0.1}"
    yarn graph create --node "$GRAPH_NODE_URL" $NAMESPACE/$SUBGRAPH_NAME 2>&1 | grep -v 'already exists' || true
    yarn graph deploy --node "$GRAPH_NODE_URL" --ipfs "$IPFS_URL" --version-label "$VERSION_LABEL" $NAMESPACE/$SUBGRAPH_NAME
elif [ "$CREATE" ]; then
    echo "Creating and deploying on graph node"
    yarn graph create --node "$GRAPH_NODE" "$NAMESPACE/$SUBGRAPH_NAME" --access-token "$API_KEY" && yarn graph deploy --node "$GRAPH_NODE" --ipfs "$IPFS" "$NAMESPACE/$SUBGRAPH_NAME" --access-token "$API_KEY"
elif [ "$STUDIO" ]; then
    echo "Deploying on graph studio"
    yarn graph deploy --studio "$SUBGRAPH_NAME" --deploy-key "$DEPLOY_KEY"
elif [ "$GOLDSKY" ]; then
    echo "Deploying $SUBGRAPH_NAME on Goldsky indexer"
    echo "Existing versions:"
    goldsky subgraph list "$SUBGRAPH_NAME" --summary --token "$GOLDSKY_API_KEY"
    echo "Enter the version number"
    read VERSION
    goldsky subgraph deploy "$SUBGRAPH_NAME/$VERSION" --path . --token "$GOLDSKY_API_KEY"
else
    echo "Deploying on graph node"
    yarn graph deploy --node "$GRAPH_NODE" --ipfs "$IPFS" "$NAMESPACE/$SUBGRAPH_NAME" --access-token "$API_KEY"
fi