#!/usr/bin/env bash
# One-time bootstrap for the OVH production host. Idempotent.
#
#   ssh -i ~/.ssh/id_ovhcloud_ns1009531.ip-135-148-122.us ubuntu@135.148.122.203
#   bash server-setup.sh
#
# Deliberately does NOT install Docker. It is already present (29.7.2), and re-running an
# installer risks restarting dockerd, which would bounce every SproutOS container on this box.
set -euo pipefail

echo "==> Checking prerequisites"
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker is not installed. Install it deliberately -- this script will not," >&2
  echo "       because a daemon restart takes the SproutOS containers down with it." >&2
  exit 1
fi
docker compose version >/dev/null || { echo "ERROR: docker compose plugin missing" >&2; exit 1; }

echo "==> Creating /opt/forum (config, compose, letsencrypt)"
sudo mkdir -p /opt/forum/letsencrypt
sudo chown -R ubuntu:ubuntu /opt/forum
chmod 700 /opt/forum/letsencrypt

# Data lives on the root disk (nvme1n1), alongside SproutOS OpenSearch and Valkey, and
# deliberately NOT on /data -- that spindle carries Kafka and ClickHouse, the noisiest IO on
# the machine.
echo "==> Creating /srv/forum data directories on the root disk"
sudo mkdir -p /srv/forum/{postgres,valkey,elasticsearch}
sudo chown -R ubuntu:ubuntu /srv/forum

echo
echo "==> Done. Next:"
echo "    1. Copy docker-compose.production.yml and bin/deploy/*.sh to /opt/forum"
echo "    2. Write /opt/forum/.env and /opt/forum/.env.production (chmod 600)"
echo "    3. docker login ghcr.io -u SproutOS-Agent   (needs a token with read:packages)"
echo "    4. bring the data services up, then run the migrator"
