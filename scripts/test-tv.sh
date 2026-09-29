#!/usr/bin/env bash
# Usage: scripts/test-tv.sh <method> [JSON]   e.g. status, diagnostics, capabilityTest
# Calls a service method on the TV through ares-novacom + luna-send-pub (channel a).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/env.sh"
need_ares
METHOD="${1:-}"
PARAMS="${2:-}"
[ -n "$PARAMS" ] || PARAMS='{}'
if [ -z "$METHOD" ]; then echo "usage: $0 <method> [JSON]" >&2; exit 2; fi
case "$METHOD" in
  schedule|cancel|status|diagnostics|capabilityTest|pairLocal|powerOff|handleLaunch) ;;
  *) echo "error: unknown method '$METHOD'" >&2; exit 2 ;;
esac
ares-novacom --device "$VTV_DEVICE" --run "luna-send-pub -n 1 -f luna://$SERVICE_ID/$METHOD '$PARAMS'"
