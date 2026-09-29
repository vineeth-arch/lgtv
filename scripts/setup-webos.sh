#!/usr/bin/env bash
# Installs the webOS CLI as a repo devDependency and verifies it runs.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/env.sh"
cd "$ROOT"
command -v npm >/dev/null || { echo "error: npm not found (brew install node)" >&2; exit 1; }
npm install
(cd tv-service && npm install --omit=dev)
need_ares
ares -V
echo "webOS CLI ready. Node: $(node -v)"
