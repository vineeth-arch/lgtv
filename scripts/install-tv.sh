#!/usr/bin/env bash
# Installs the newest build/*.ipk on the TV named $VTV_DEVICE (default: tv).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/env.sh"
source "$(dirname "${BASH_SOURCE[0]}")/lib/find-ipk.sh"
need_ares
ares-install --device "$VTV_DEVICE" "$IPK"
