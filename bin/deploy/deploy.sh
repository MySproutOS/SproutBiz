#!/usr/bin/env bash
# Single deployment entrypoint. Runs migrations on the server, then swaps containers.
#
#   bin/deploy/deploy.sh <website|bullground|all> <image-tag>
#
# Environment:
#   SERVER            default ubuntu@135.148.122.203
#   SSH_KEY           default ~/.ssh/id_ovhcloud_ns1009531.ip-135-148-122.us
#   GHCR_TOKEN        optional; when set, the server is logged into GHCR before pulling.
#                     CI passes the ephemeral GITHUB_TOKEN.
#   GHCR_USER         default SproutOS-Agent
#   SKIP_MIGRATIONS   set to 1 to skip the migration step
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <website|bullground|all> <image-tag>" >&2
  exit 1
fi

TARGET="$1"
TAG="$2"
case "$TARGET" in website | bullground | all) ;; *)
  echo "Unknown target '$TARGET' (expected website, bullground, or all)" >&2
  exit 1
  ;;
esac

SERVER="${SERVER:-ubuntu@135.148.122.203}"
GHCR_USER="${GHCR_USER:-SproutOS-Agent}"
REMOTE_DIR=/opt/forum
COMPOSE="docker compose -f $REMOTE_DIR/docker-compose.production.yml"

SSH_ARGS=()
if [ -n "${SSH_KEY:-}" ]; then
  SSH_ARGS+=(-i "$SSH_KEY")
elif [ -f "$HOME/.ssh/id_ovhcloud_ns1009531.ip-135-148-122.us" ]; then
  SSH_ARGS+=(-i "$HOME/.ssh/id_ovhcloud_ns1009531.ip-135-148-122.us")
fi
run_remote() { ssh "${SSH_ARGS[@]}" -o BatchMode=yes "$SERVER" "$@"; }

# --- 1. GHCR login, so the pulls below can see the images ---------------------
if [ -n "${GHCR_TOKEN:-}" ]; then
  echo "==> Logging the server into GHCR as $GHCR_USER"
  printf '%s' "$GHCR_TOKEN" | run_remote "docker login ghcr.io -u $GHCR_USER --password-stdin"
fi

# --- 2. Migrations, before anything is swapped -------------------------------
# Run on the server rather than from CI, which is what lets Postgres stay unpublished. If a
# migration fails the deploy stops here, so a broken schema never reaches a running container.
#
# Migrations must stay backward-compatible (expand, then contract in a later deploy): the old
# container keeps serving against the new schema until the swap completes.
if [ "${SKIP_MIGRATIONS:-0}" = "1" ]; then
  echo "==> Skipping migrations (SKIP_MIGRATIONS=1)"
else
  echo "==> Running migrations on the server"
  run_remote "cd $REMOTE_DIR && sed -i 's|^MIGRATOR_TAG=.*|MIGRATOR_TAG=$TAG|' .env && \
    $COMPOSE --profile migrate run --rm dbmigrator"
fi

# --- 3. Swap the requested containers ----------------------------------------
deploy_service() {
  local service="$1" tag_var="$2"
  echo "==> Deploying $service ($TAG)"
  run_remote "cd $REMOTE_DIR && \
    grep -q '^$tag_var=' .env && sed -i 's|^$tag_var=.*|$tag_var=$TAG|' .env || echo '$tag_var=$TAG' >> .env"
  run_remote "cd $REMOTE_DIR && $COMPOSE pull $service && $COMPOSE up -d $service"

  echo "==> Waiting for $service to report healthy"
  run_remote "cd $REMOTE_DIR && for i in \$(seq 1 60); do \
      status=\$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' forum_${service} 2>/dev/null || echo missing); \
      if [ \"\$status\" = healthy ] || [ \"\$status\" = none ]; then echo \"    \$service: \$status\"; exit 0; fi; \
      sleep 2; \
    done; echo 'ERROR: '$service' did not become healthy' >&2; docker logs --tail 50 forum_${service} >&2; exit 1"
}

if [ "$TARGET" = "website" ] || [ "$TARGET" = "all" ]; then
  deploy_service website WEBSITE_TAG
fi
if [ "$TARGET" = "bullground" ] || [ "$TARGET" = "all" ]; then
  deploy_service bullground BULLGROUND_TAG
fi

echo "==> Deploy finished: $TARGET @ $TAG"
