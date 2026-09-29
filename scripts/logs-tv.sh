#!/usr/bin/env bash
# Streams TV journal logs filtered to V/TV. Ctrl-C to stop.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/env.sh"
need_ares
ares-log --device "$VTV_DEVICE" -f | grep --line-buffered -i "vtvsleep"
