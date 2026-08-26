#!/usr/bin/env bash
#
# Push the local .env.production to the OVH box.
#
# Production runtime config lives in /opt/forum/.env.production on the box, read
# via `env_file:` in docker-compose.production.yml. It is not in git (it holds
# live Stripe and OAuth credentials), so the local copy at the repo root -- also
# gitignored -- is the working copy, and this script is how it gets deployed.
#
# Not covered here: /opt/forum/.env, which holds the datastore passwords used for
# compose ${...} interpolation plus the *_TAG image pins. deploy.sh rewrites those
# tags on every deploy, so that file is machine-owned and syncing it would clobber
# whatever is currently running.
#
# Usage:
#   bin/deploy/sync-env.sh              # diff, confirm, upload, recreate app containers
#   bin/deploy/sync-env.sh --diff       # show what would change, upload nothing
#   bin/deploy/sync-env.sh --pull       # overwrite the local copy from the box
#   bin/deploy/sync-env.sh --no-restart # upload only; changes apply on the next deploy
#   bin/deploy/sync-env.sh --yes        # skip the confirmation prompt
#   bin/deploy/sync-env.sh --compose    # push docker-compose.production.yml instead
#
# --compose exists because the compose file is in git but nothing was pushing it, so the copy on
# the server could be hand-edited and quietly stay that way. It was, for hours: one line pinned a
# locally built image, and every deploy recreated the site from it. deploy.sh now refuses to run
# when the two differ; this is the command it points you at.
set -euo pipefail

REMOTE_HOST="${FORUM_SSH_HOST:-ubuntu@135.148.122.203}"
REMOTE_DIR="${FORUM_REMOTE_DIR:-/opt/forum}"
SSH_KEY="${FORUM_SSH_KEY:-$HOME/.ssh/id_ovhcloud_ns1009531.ip-135-148-122.us}"
COMPOSE_FILE="$REMOTE_DIR/docker-compose.production.yml"
# Services with `env_file: .env.production`. Datastores are deliberately absent:
# they take their credentials from /opt/forum/.env, and bouncing Postgres or
# Elasticsearch to change an app secret is needless downtime.
SERVICES="${FORUM_ENV_SERVICES:-website bullground}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_ENV="$REPO_ROOT/.env.production"
REMOTE_ENV="$REMOTE_DIR/.env.production"

DO_DIFF_ONLY=0 DO_PULL=0 DO_RESTART=1 ASSUME_YES=0 DO_COMPOSE=0
for arg in "$@"; do
  case "$arg" in
    --diff) DO_DIFF_ONLY=1 ;;
    --pull) DO_PULL=1 ;;
    --no-restart) DO_RESTART=0 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --compose) DO_COMPOSE=1 ;;
    -h|--help) sed -n '2,31p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

ssh_opts=(-o BatchMode=yes)
[ -f "$SSH_KEY" ] && ssh_opts+=(-i "$SSH_KEY")
run_remote() { ssh "${ssh_opts[@]}" "$REMOTE_HOST" "$@"; }

# The compose file carries no secrets, so unlike .env.production it is committed and the repo copy
# is simply the truth. Nothing to mask, nothing to confirm -- show the diff and replace it.
if [ "$DO_COMPOSE" = 1 ]; then
  LOCAL_COMPOSE="$REPO_ROOT/docker-compose.production.yml"
  [ -f "$LOCAL_COMPOSE" ] || { echo "missing $LOCAL_COMPOSE" >&2; exit 1; }

  tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
  run_remote "cat $COMPOSE_FILE 2>/dev/null || true" > "$tmp"
  if diff -q "$tmp" "$LOCAL_COMPOSE" >/dev/null 2>&1; then
    echo "compose file already matches $REMOTE_HOST"
    exit 0
  fi
  echo "Replacing $REMOTE_HOST:$COMPOSE_FILE (-- server, ++ this checkout)"
  diff -u "$tmp" "$LOCAL_COMPOSE" | tail -n +3 || true
  echo

  if [ "$ASSUME_YES" != 1 ] && [ "$DO_DIFF_ONLY" != 1 ]; then
    read -r -p "Replace the server's copy? [y/N] " reply
    case "$reply" in [yY]*) ;; *) echo "aborted"; exit 1 ;; esac
  fi
  [ "$DO_DIFF_ONLY" = 1 ] && exit 0

  # Kept as .bak for the same reason the env file is: whatever was on the server was there for some
  # reason, and finding out what it said should not require a redeploy.
  run_remote "cp $COMPOSE_FILE $COMPOSE_FILE.bak 2>/dev/null || true"
  run_remote "cat > $COMPOSE_FILE.new && mv $COMPOSE_FILE.new $COMPOSE_FILE" < "$LOCAL_COMPOSE"
  echo "uploaded (previous version kept at $COMPOSE_FILE.bak)"
  echo "Containers keep running the old definition until the next deploy or an explicit up -d."
  exit 0
fi

if [ "$DO_PULL" = 1 ]; then
  tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
  run_remote "cat $REMOTE_ENV" > "$tmp"
  [ -s "$tmp" ] || { echo "refusing to overwrite local copy: remote file is empty" >&2; exit 1; }
  mv "$tmp" "$LOCAL_ENV"; trap - EXIT
  chmod 600 "$LOCAL_ENV"
  echo "pulled $REMOTE_HOST:$REMOTE_ENV -> $LOCAL_ENV"
  exit 0
fi

[ -f "$LOCAL_ENV" ] || { echo "missing $LOCAL_ENV (run with --pull to seed it from the box)" >&2; exit 1; }

# Guard against uploading a file that would leave the app half-configured. Empty
# values are allowed -- some vars are legitimately blank -- but a missing NODE_ENV
# or DATABASE_URL means the file got truncated somewhere.
for required in NODE_ENV DATABASE_URL NEXT_PUBLIC_HOST_URL; do
  grep -qE "^${required}=." "$LOCAL_ENV" || { echo "$LOCAL_ENV is missing $required -- refusing to upload" >&2; exit 1; }
done

echo "Comparing $LOCAL_ENV -> $REMOTE_HOST:$REMOTE_ENV"
echo "(values masked; -- is the box, ++ is local)"
echo
# Print each key with a short digest of its value rather than the value itself, so
# a diff shows which secrets changed without putting live credentials in the
# scrollback. Length alone is not enough: a rotated credential is usually the same
# length as the one it replaces, and would show up as no change at all.
mask() {
  while IFS= read -r line; do
    key="${line%%=*}"
    value="${line#*=}"
    if [ -z "$value" ]; then
      printf '%s = (empty)\n' "$key"
    else
      printf '%s = %s... [%d chars]\n' "$key" \
        "$(printf '%s' "$value" | shasum -a 256 | cut -c1-8)" "${#value}"
    fi
  done
}
remote_masked="$(run_remote "cat $REMOTE_ENV 2>/dev/null || true" | grep -vE '^\s*(#|$)' | sort | mask)"
local_masked="$(grep -vE '^\s*(#|$)' "$LOCAL_ENV" | sort | mask)"
if diff -u <(echo "$remote_masked") <(echo "$local_masked") | tail -n +3; then
  echo "No changes -- remote already matches local."
  [ "$DO_RESTART" = 1 ] || exit 0
fi
echo

[ "$DO_DIFF_ONLY" = 1 ] && exit 0

if [ "$ASSUME_YES" != 1 ]; then
  read -r -p "Upload to $REMOTE_HOST and recreate [$SERVICES]? [y/N] " reply
  case "$reply" in [yY]*) ;; *) echo "aborted"; exit 1 ;; esac
fi

# Write via a temp file so an interrupted transfer never leaves a truncated
# .env.production behind, and keep one generation of backup on the box.
run_remote "cp $REMOTE_ENV $REMOTE_ENV.bak 2>/dev/null || true"
run_remote "cat > $REMOTE_ENV.new && chmod 600 $REMOTE_ENV.new && mv $REMOTE_ENV.new $REMOTE_ENV" < "$LOCAL_ENV"
echo "uploaded (previous version kept at $REMOTE_ENV.bak)"

if [ "$DO_RESTART" = 1 ]; then
  echo "recreating: $SERVICES"
  run_remote "cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE up -d --force-recreate --no-deps $SERVICES"
  run_remote "cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE ps --format '{{.Service}}\t{{.State}}\t{{.Status}}'"
else
  echo "skipped restart -- containers still hold the old values until the next recreate"
fi
