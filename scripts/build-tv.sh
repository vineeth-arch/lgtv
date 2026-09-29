#!/usr/bin/env bash
# Runs unit tests, then packages tv-app + tv-service into build/*.ipk.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/env.sh"
need_ares
cd "$ROOT"
[ -d tv-service/node_modules/ws ] || { echo "error: tv-service/node_modules/ws missing. Run scripts/setup-webos.sh" >&2; exit 1; }
npm test
mkdir -p build
rm -f build/*.ipk
ares-package tv-app tv-service -o build/
ipk="$(ls -1 build/*.ipk 2>/dev/null | head -1 || true)"
[ -n "$ipk" ] || { echo "error: ares-package produced no .ipk" >&2; exit 1; }
echo "IPK: $ROOT/$ipk ($(wc -c < "$ipk" | tr -d ' ') bytes)"
