#!/usr/bin/env bash
# Sourced by every script. Sets ROOT, PATH (node@24 if present, repo node_modules/.bin) and VTV_DEVICE.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export ROOT
if [ -d /opt/homebrew/opt/node@24/bin ]; then
  export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
fi
export PATH="$ROOT/node_modules/.bin:$PATH"
export VTV_DEVICE="${VTV_DEVICE:-tv}"
export APP_ID="com.designinnsaeit.vtvsleep"
export SERVICE_ID="com.designinnsaeit.vtvsleep.service"

need_ares() {
  if ! command -v ares >/dev/null 2>&1; then
    echo "error: 'ares' not found. Run scripts/setup-webos.sh first." >&2
    exit 1
  fi
}
