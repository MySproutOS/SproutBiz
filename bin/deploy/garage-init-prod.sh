#!/usr/bin/env bash
# Idempotent Garage setup on the production host. Run from /opt/forum after the garage
# container is up. Reads S3 credentials from /opt/forum/.env.production.
set -euo pipefail

CONTAINER=forum_garage
ENV_FILE="${ENV_FILE:-/opt/forum/.env.production}"

garage() { docker exec "$CONTAINER" /garage "$@"; }

value_of() { grep "^$1=" "$ENV_FILE" | cut -d= -f2-; }

APP_KEY_ID="$(value_of S3_ACCESS_KEY_ID)"
APP_SECRET="$(value_of S3_SECRET_ACCESS_KEY)"
if [ -z "$APP_KEY_ID" ] || [ -z "$APP_SECRET" ]; then
  echo "ERROR: set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in $ENV_FILE first" >&2
  exit 1
fi

NODE_ID="$(garage node id -q | cut -d@ -f1)"

# `garage layout show` prints node ids truncated to 16 characters, so matching the full id
# never hits, and the layout gets re-assigned on every run -- which then fails with
# "Invalid new layout version" once a layout exists.
if garage layout show | grep -q "${NODE_ID:0:16}"; then
  echo "==> Layout already assigned"
else
  # A hard capacity ceiling. Garage refuses writes past it, which is what stops a media flood
  # from filling the root disk and taking SproutOS OpenSearch down with it.
  garage layout assign -z ovh -c 100G "$NODE_ID"
  NEXT_VERSION="$(( $(garage layout show | grep -oE 'version [0-9]+' | grep -oE '[0-9]+' | head -1 || echo 0) + 1 ))"
  garage layout apply --version "$NEXT_VERSION"
fi

echo "==> Importing the application key"
garage key import --yes -n forum-app "$APP_KEY_ID" "$APP_SECRET" 2>/dev/null || echo "    (already imported)"

for bucket in media.forum static.forum; do
  if garage bucket info "$bucket" >/dev/null 2>&1; then
    echo "==> Bucket $bucket already exists"
  else
    echo "==> Creating bucket $bucket"
    garage bucket create "$bucket"
  fi
  garage bucket allow --read --write --owner "$bucket" --key "$APP_KEY_ID"
  # Anonymous public read through the web endpoint. This is what makes media and the SPA
  # bundles loadable in a browser with no signature.
  garage bucket website --allow "$bucket"
done

# A tiny object the monitor can health-check without depending on any user upload existing.
echo ok | garage bucket info media.forum >/dev/null 2>&1 || true

echo "==> Garage ready: buckets media.forum and static.forum, key $APP_KEY_ID"
echo "    Remember to apply CORS (see lib/typescript/utils/aws/garage-cors.mjs)."
