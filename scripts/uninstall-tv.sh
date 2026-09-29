#!/usr/bin/env bash
# Removes V/TV Sleep from the TV. Does not touch local files.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/env.sh"
need_ares
ares-install --device "$VTV_DEVICE" --remove "$APP_ID"
