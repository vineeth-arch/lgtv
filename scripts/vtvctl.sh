#!/usr/bin/env bash
# Builds (release) and runs vtvctl. Usage: scripts/vtvctl.sh <vtvctl args>
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$ROOT/ios/VTVCore"
swift build -c release --package-path "$PKG" --product vtvctl >&2
exec "$(swift build -c release --package-path "$PKG" --show-bin-path)/vtvctl" "$@"
