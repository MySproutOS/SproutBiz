#!/usr/bin/env bash
# Single deployment entrypoint. Runs migrations on the server, then swaps containers.
#
#   bin/deploy/deploy.sh <website|bullground|all> <image-tag>
#
# Environment:
#   SERVER            default ubuntu@40.160.59.152
#   SSH_KEY           default ~/.ssh/id_ovh_toyourcredit
#   GHCR_TOKEN        optional; when set, the server is logged into GHCR before pulling.
#                     CI passes the ephemeral GITHUB_TOKEN.
#   GHCR_USER         default SproutOS-Agent
#   SKIP_MIGRATIONS   set to 1 to skip the migration step
#   ALLOW_COMPOSE_DRIFT  set to 1 to deploy even though the server's compose file differs
#                     from this commit's. Read the diff first -- see the check below.
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

SERVER="${SERVER:-ubuntu@40.160.59.152}"
GHCR_USER="${GHCR_USER:-SproutOS-Agent}"
REMOTE_DIR=/opt/sproutbiz
COMPOSE="docker compose -f $REMOTE_DIR/docker-compose.production.yml"

SSH_ARGS=()
if [ -n "${SSH_KEY:-}" ]; then
  SSH_ARGS+=(-i "$SSH_KEY")
elif [ -f "$HOME/.ssh/id_ovh_toyourcredit" ]; then
  SSH_ARGS+=(-i "$HOME/.ssh/id_ovh_toyourcredit")
fi
run_remote() { ssh "${SSH_ARGS[@]}" -o BatchMode=yes "$SERVER" "$@"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_COMPOSE="$REPO_ROOT/docker-compose.production.yml"

# --- 0. The server's compose file must match this commit's --------------------
#
# It is in git, but nothing was pushing it, so the copy at $REMOTE_DIR could be edited in place and
# quietly stay that way. It was: one line read `image: forum-website:local`, left behind after a
# session of debugging against a locally built image. The consequences took hours to find, because
# the failure and the cause looked unrelated -- `docker compose pull` failed on a tag that exists
# only on that box, and, before it failed, every `up -d` had been recreating the website from that
# stale local image. A fix would deploy green and change nothing about what was actually running.
#
# So: compare, and refuse. Refuse rather than overwrite, because an operator who edited that file
# during an incident is owed the chance to see the diff before it disappears -- and because a deploy
# that silently reverts a deliberate change is the same class of surprise in the other direction.
# `bin/deploy/sync-env.sh --compose` is the one-command fix when the server's copy is simply stale.
if [ -f "$LOCAL_COMPOSE" ]; then
  echo "==> Checking the server's compose file matches this commit"
  # sha256sum on Linux, shasum on macOS; CI and the server are Linux, a developer running this by
  # hand is usually not, and neither command exists on both.
  sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
  local_sum="$(sha256 "$LOCAL_COMPOSE" | cut -d' ' -f1)"
  remote_sum="$(run_remote "{ command -v sha256sum >/dev/null 2>&1 && sha256sum $REMOTE_DIR/docker-compose.production.yml || shasum -a 256 $REMOTE_DIR/docker-compose.production.yml; } 2>/dev/null | cut -d' ' -f1" || true)"

  if [ -z "$remote_sum" ]; then
    echo "ERROR: no compose file at $SERVER:$REMOTE_DIR/docker-compose.production.yml" >&2
    echo "       Run: bin/deploy/sync-env.sh --compose" >&2
    exit 1
  fi
  if [ "$local_sum" != "$remote_sum" ]; then
    echo "ERROR: the server's compose file differs from this commit's." >&2
    echo "       Anything you deploy now runs under a file nobody has reviewed." >&2
    echo >&2
    echo "  --- server                                    +++ this commit" >&2
    run_remote "cat $REMOTE_DIR/docker-compose.production.yml" > /tmp/remote-compose.$$ 2>/dev/null || true
    diff -u /tmp/remote-compose.$$ "$LOCAL_COMPOSE" | tail -n +3 | sed 's/^/  /' >&2 || true
    rm -f /tmp/remote-compose.$$
    echo >&2
    if [ "${ALLOW_COMPOSE_DRIFT:-0}" = "1" ]; then
      echo "  ALLOW_COMPOSE_DRIFT=1 -- continuing anyway." >&2
    else
      echo "  If the server's copy is stale:   bin/deploy/sync-env.sh --compose" >&2
      echo "  If the change on the server is deliberate, commit it." >&2
      echo "  To deploy regardless:            ALLOW_COMPOSE_DRIFT=1 $0 $TARGET $TAG" >&2
      exit 1
    fi
  else
    echo "    compose file matches"
  fi
fi

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
  run_remote "cd $REMOTE_DIR && stable=0; last_restarts=-1; for i in \$(seq 1 60); do \
      status=\$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' sproutbiz_${service} 2>/dev/null || echo missing); \
      if [ \"\$status\" = healthy ]; then echo \"    \$service: healthy\"; exit 0; fi; \
      if [ \"\$status\" = none ]; then \
        running=\$(docker inspect -f '{{.State.Running}}' sproutbiz_${service} 2>/dev/null || echo false); \
        restarts=\$(docker inspect -f '{{.RestartCount}}' sproutbiz_${service} 2>/dev/null || echo -1); \
        if [ \"\$running\" = true ] && [ \"\$restarts\" = \"\$last_restarts\" ]; then stable=\$((stable + 1)); else stable=0; fi; \
        last_restarts=\$restarts; \
        if [ \"\$stable\" -ge 5 ]; then echo \"    \$service: running without a restart for 10 seconds\"; exit 0; fi; \
      fi; \
      sleep 2; \
    done; echo 'ERROR: '$service' did not become healthy' >&2; docker logs --tail 50 sproutbiz_${service} >&2; exit 1"
}

if [ "$TARGET" = "website" ] || [ "$TARGET" = "all" ]; then
  deploy_service website WEBSITE_TAG
fi
if [ "$TARGET" = "bullground" ] || [ "$TARGET" = "all" ]; then
  deploy_service bullground BULLGROUND_TAG
fi

echo "==> Deploy finished: $TARGET @ $TAG"
