#!/usr/bin/env bash
# One-time bootstrap for the OVH production host. Idempotent.
#
#   ssh -i ~/.ssh/id_ovh_toyourcredit ubuntu@40.160.59.152
#   bash server-setup.sh
#
# Deliberately does not install Docker. Verify it before running this script.
set -euo pipefail

echo "==> Checking prerequisites"
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker is not installed. Install it deliberately -- this script will not," >&2
  echo "       because a daemon restart takes the SproutOS containers down with it." >&2
  exit 1
fi
docker compose version >/dev/null || { echo "ERROR: docker compose plugin missing" >&2; exit 1; }

echo "==> Creating /opt/sproutbiz (config, compose, letsencrypt)"
sudo mkdir -p /opt/sproutbiz/letsencrypt
sudo chown -R ubuntu:ubuntu /opt/sproutbiz
chmod 700 /opt/sproutbiz/letsencrypt

# Data lives on the mirrored root filesystem (/dev/md3 across both NVMe devices), separate from
# the deactivated toyourcredit volumes. Keeping it under /srv/sproutbiz makes the backup and
# restore boundary explicit.
echo "==> Creating /srv/sproutbiz data directories"
sudo mkdir -p /srv/sproutbiz/{postgres,valkey,elasticsearch}
sudo chown -R ubuntu:ubuntu /srv/sproutbiz

echo
echo "==> Done. Next:"
echo "    1. Copy docker-compose.production.yml and bin/deploy/*.sh to /opt/sproutbiz"
echo "    2. Write /opt/sproutbiz/.env and /opt/sproutbiz/.env.production (chmod 600)"
echo "    3. docker login ghcr.io -u SproutOS-Agent   (needs a token with read:packages)"
echo "    4. bring the data services up, then run the migrator"
