#!/usr/bin/env bash
# Usage: scripts/launch-tv.sh [JSON_PARAMS]   e.g. '{"mode":"schedule","minutes":2}'
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/env.sh"
need_ares
if [ -n "${1:-}" ]; then
  ares-launch --device "$VTV_DEVICE" --params "$1" "$APP_ID"
else
  ares-launch --device "$VTV_DEVICE" "$APP_ID"
fi
