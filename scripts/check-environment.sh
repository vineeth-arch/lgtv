#!/usr/bin/env bash
# Reports which dev tools are present. Missing Xcode is expected (iOS builds run in CI).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/env.sh"

status=0
check() { # name, command, required(1/0)
  local name="$1" cmd="$2" req="$3" out
  if out="$(eval "$cmd" 2>&1 | head -1)" && [ -n "$out" ]; then
    printf '  ok       %-8s %s\n' "$name" "$out"
  elif [ "$req" = 1 ]; then
    printf '  MISSING  %-8s (required)\n' "$name"; status=1
  else
    printf '  absent   %-8s (optional)\n' "$name"
  fi
}
echo "V/TV Sleep environment check (root: $ROOT)"
check brew  "brew --version" 1
check node  "node -v" 1
check npm   "npm -v" 1
check git   "git --version" 1
check ares  "ares -V" 1
check swift "swift --version" 0
check gh    "gh --version" 0
if xcodebuild -version >/dev/null 2>&1; then
  echo "  ok       xcode    $(xcodebuild -version | head -1)"
else
  echo "  absent   xcode    (expected; iOS app is built in GitHub Actions)"
fi
[ "$status" = 0 ] || { echo "Some required tools are missing. Try scripts/setup-webos.sh" >&2; exit 1; }
