#!/usr/bin/env bash
# Idempotent Garage (local S3) initialization for SproutBiz dev.
# Requires the sprout_garage container to be running (docker-compose up -d).
# Creates the cluster layout, imports the fixed dev key from .env, and creates the media bucket.
set -euo pipefail

CONTAINER=sprout_garage
BUCKET=sprout-media

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ACCESS_KEY="$(grep '^S3_ACCESS_KEY_ID=' "$ROOT_DIR/.env" | cut -d= -f2)"
SECRET_KEY="$(grep '^S3_SECRET_ACCESS_KEY=' "$ROOT_DIR/.env" | cut -d= -f2)"

garage() {
  docker exec "$CONTAINER" /garage "$@"
}

NODE_ID="$(garage node id -q | cut -d@ -f1)"

# `garage layout show` prints node ids truncated to 16 characters, so matching on the full id
# never hits and the layout gets re-assigned on every run -- which then fails with
# "Invalid new layout version" once a layout already exists.
if garage layout show | grep -q "${NODE_ID:0:16}"; then
  echo "Layout already assigned"
else
  garage layout assign -z dc1 -c 10G "$NODE_ID"
  # Apply the next version rather than a hard-coded 1, so this works against an existing
  # cluster as well as a fresh one.
  NEXT_VERSION="$(( $(garage layout show | grep -oE 'version [0-9]+' | grep -oE '[0-9]+' | head -1 || echo 0) + 1 ))"
  garage layout apply --version "$NEXT_VERSION"
fi

if garage key info "$ACCESS_KEY" >/dev/null 2>&1; then
  echo "Key already imported"
else
  garage key import --yes -n sprout-dev "$ACCESS_KEY" "$SECRET_KEY"
fi

if garage bucket info "$BUCKET" >/dev/null 2>&1; then
  echo "Bucket already exists"
else
  garage bucket create "$BUCKET"
fi

garage bucket allow --read --write --owner "$BUCKET" --key "$ACCESS_KEY"
garage bucket website --allow "$BUCKET"
echo "Garage ready: bucket=$BUCKET key=$ACCESS_KEY"
