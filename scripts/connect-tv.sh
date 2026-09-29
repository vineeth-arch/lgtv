#!/usr/bin/env bash
# Usage: scripts/connect-tv.sh <TV_IP> [PORT]
# Adds the TV as an ares device, fetches the SSH key (ares-novacom will ask for the
# 6-character passphrase shown in the TV's Developer Mode app), and records device info.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/env.sh"
need_ares
IP="${1:-}"
PORT="${2:-9922}"
if [ -z "$IP" ]; then echo "usage: $0 <TV_IP> [PORT]" >&2; exit 2; fi
mkdir -p "$ROOT/diagnostics"

ares-setup-device --add "$VTV_DEVICE" -i "host=$IP" -i "port=$PORT" -i "username=prisoner" 2>&1 \
  || ares-setup-device --modify "$VTV_DEVICE" -i "host=$IP" -i "port=$PORT" -i "username=prisoner"
echo "Fetching key. Enter the passphrase shown in the TV Developer Mode app when asked."
ares-novacom --device "$VTV_DEVICE" --getkey
ares-device --device "$VTV_DEVICE" --system-info > "$ROOT/diagnostics/device-info.json"
ares-device --device "$VTV_DEVICE" --resource-info > "$ROOT/diagnostics/resource-info.txt" || true
echo "Saved diagnostics/device-info.json"
