#!/usr/bin/env bash
# Repeatable data migration from the current Photon forum to the new 32 GB OVH host.
#
#   bin/deploy/migrate-from-photon.sh stage
#   SPROUTBIZ_CUTOVER=I_UNDERSTAND bin/deploy/migrate-from-photon.sh cutover
#
# `stage` takes a transactionally consistent online Postgres snapshot and restores it on the
# namespaced destination stack. `cutover` is the short-downtime final pass: it verifies apex DNS,
# stops the two old writers, takes a final database snapshot, transfers Valkey's gracefully flushed
# persistence files, runs migrations, and starts the new public stack. It deliberately leaves the
# old Postgres, Elasticsearch, and Traefik intact for manual rollback/forensics.
set -euo pipefail

MODE="${1:-}"
case "$MODE" in stage | cutover) ;; *)
  echo "Usage: $0 <stage|cutover>" >&2
  exit 2
  ;;
esac

OLD_SERVER="${SPROUTBIZ_OLD_SERVER:-ubuntu@135.148.122.203}"
NEW_SERVER="${SPROUTBIZ_NEW_SERVER:-ubuntu@40.160.59.152}"
OLD_KEY="${SPROUTBIZ_OLD_SSH_KEY:-$HOME/.ssh/id_ovh_photon}"
NEW_KEY="${SPROUTBIZ_NEW_SSH_KEY:-$HOME/.ssh/id_ovh_toyourcredit}"
NEW_DIR="${SPROUTBIZ_REMOTE_DIR:-/opt/sproutbiz}"
EXPECTED_IPV4="${SPROUTBIZ_NEW_IPV4:-40.160.59.152}"

for key in "$OLD_KEY" "$NEW_KEY"; do
  [ -f "$key" ] || { echo "Missing SSH key: $key" >&2; exit 1; }
done
for command in pg_restore tar ssh scp; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing local command: $command" >&2; exit 1; }
done

old_ssh() { ssh -i "$OLD_KEY" -o BatchMode=yes "$OLD_SERVER" "$@"; }
new_ssh() { ssh -i "$NEW_KEY" -o BatchMode=yes "$NEW_SERVER" "$@"; }

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
dump_file="$tmp_dir/forum.dump"
valkey_file="$tmp_dir/forum-valkey.tar.gz"

preflight() {
  old_ssh "docker inspect forum_postgres forum_valkey forum_website forum_bullground >/dev/null"
  new_ssh "test -f '$NEW_DIR/docker-compose.production.yml' && test -f '$NEW_DIR/.env' && test -f '$NEW_DIR/.env.production'"
  new_ssh "docker inspect sproutbiz_postgres sproutbiz_valkey >/dev/null"
}

snapshot_database() {
  echo "==> Taking a consistent Postgres snapshot from Photon"
  old_ssh "docker exec forum_postgres pg_dump -U forum -d main --format=custom --no-owner --no-privileges" > "$dump_file"
  [ -s "$dump_file" ] || { echo "Database snapshot is empty" >&2; exit 1; }
  pg_restore --list "$dump_file" >/dev/null
  echo "    snapshot validated ($(du -h "$dump_file" | awk '{print $1}'))"
}

restore_database() {
  echo "==> Restoring the snapshot into the namespaced destination database"
  # Reset the schema first. `pg_restore --clean` only drops objects present in the incoming dump,
  # which would otherwise leave newer tables from an earlier staged migration behind.
  new_ssh "docker exec sproutbiz_postgres psql -U forum -d main -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE' -c 'CREATE SCHEMA public AUTHORIZATION forum'"
  new_ssh "docker exec -i sproutbiz_postgres pg_restore -U forum -d main --no-owner --no-privileges --exit-on-error" < "$dump_file"
}

preflight

if [ "$MODE" = stage ]; then
  snapshot_database
  restore_database
  echo "==> Staging complete; Photon remained online and authoritative"
  exit 0
fi

[ "${SPROUTBIZ_CUTOVER:-}" = "I_UNDERSTAND" ] || {
  echo "Cutover stops the old writers. Re-run with SPROUTBIZ_CUTOVER=I_UNDERSTAND." >&2
  exit 1
}

if ! command -v dig >/dev/null 2>&1; then
  echo "dig is required for the cutover DNS preflight" >&2
  exit 1
fi
if ! dig +short A sproutos.biz | grep -Fxq "$EXPECTED_IPV4"; then
  echo "sproutos.biz does not resolve to $EXPECTED_IPV4; refusing cutover" >&2
  exit 1
fi

echo "==> Pulling destination images before the downtime window"
new_ssh "cd '$NEW_DIR' && docker compose -f docker-compose.production.yml pull website bullground dbmigrator traefik"

# Invoked indirectly from the EXIT trap below.
# shellcheck disable=SC2329
rollback_old_writers() {
  echo "ERROR: cutover did not finish; restarting the old Valkey, website, and worker" >&2
  old_ssh "docker start forum_valkey forum_website forum_bullground >/dev/null" || true
}
# shellcheck disable=SC2329
cleanup_cutover() {
  cutover_status=$?
  trap - EXIT
  if [ "$cutover_status" -ne 0 ]; then rollback_old_writers; fi
  rm -rf "$tmp_dir"
  exit "$cutover_status"
}
trap cleanup_cutover EXIT

echo "==> Entering downtime: stopping Photon website and worker"
old_ssh "docker stop -t 120 forum_website forum_bullground >/dev/null"
snapshot_database

echo "==> Gracefully stopping Photon Valkey and archiving its durable queue state"
old_ssh "docker stop -t 120 forum_valkey >/dev/null"
old_ssh "sudo tar --numeric-owner -C /srv/forum -czf - valkey" > "$valkey_file"
[ -s "$valkey_file" ] || { echo "Valkey archive is empty" >&2; exit 1; }
tar -tzf "$valkey_file" >/dev/null

echo "==> Stopping any destination writers and restoring final Postgres data"
new_ssh "docker stop -t 120 sproutbiz_website sproutbiz_bullground 2>/dev/null || true"
restore_database

echo "==> Replacing only the destination Valkey volume (a timestamped backup is retained)"
scp -i "$NEW_KEY" -q "$valkey_file" "$NEW_SERVER:$NEW_DIR/forum-valkey.tar.gz.new"
new_ssh "set -e; cd '$NEW_DIR'; docker stop -t 120 sproutbiz_valkey >/dev/null; stamp=\$(date -u +%Y%m%dT%H%M%SZ); sudo mv /srv/sproutbiz/valkey /srv/sproutbiz/valkey.pre-cutover.\$stamp; sudo tar --numeric-owner -C /srv/sproutbiz -xzf '$NEW_DIR/forum-valkey.tar.gz.new'; rm -f '$NEW_DIR/forum-valkey.tar.gz.new'; docker compose -f docker-compose.production.yml up -d postgres valkey elasticsearch"

echo "==> Waiting for destination datastores"
new_ssh "for i in \$(seq 1 60); do pg=\$(docker inspect -f '{{.State.Health.Status}}' sproutbiz_postgres 2>/dev/null || true); valkey=\$(docker inspect -f '{{.State.Running}}' sproutbiz_valkey 2>/dev/null || true); [ \"\$pg\" = healthy ] && [ \"\$valkey\" = true ] && exit 0; sleep 2; done; exit 1"

echo "==> Running all schema migrations and starting the new public stack"
new_ssh "cd '$NEW_DIR' && docker compose -f docker-compose.production.yml --profile migrate run --rm dbmigrator && docker compose -f docker-compose.production.yml up -d traefik website bullground"

echo "==> Verifying the new origin"
for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error --resolve "sproutos.biz:443:$EXPECTED_IPV4" https://sproutos.biz/login >/dev/null; then
    echo "==> Cutover complete. Photon data services and Traefik remain intact; its writers are stopped."
    trap 'rm -rf "$tmp_dir"' EXIT
    exit 0
  fi
  echo "    waiting for HTTPS (${attempt}/60)"
  sleep 2
done
echo "The new origin did not become healthy" >&2
exit 1
