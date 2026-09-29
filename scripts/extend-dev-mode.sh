#!/usr/bin/env bash
# Extends the TV Developer Mode session (resets the countdown).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/env.sh"
if ! command -v ares-extend-dev >/dev/null 2>&1; then
  echo "error: ares-extend-dev not in this CLI version. Use the 'Extend' button in the TV Developer Mode app." >&2
  exit 1
fi
ares-extend-dev --device "$VTV_DEVICE"
