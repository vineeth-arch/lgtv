#!/usr/bin/env bash
# Builds the .ipk (npm test runs inside build-tv.sh) and assembles release/.
# Only ever deletes release/ contents; nothing else.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/env.sh"
cd "$ROOT"

"$ROOT/scripts/build-tv.sh"

VERSION="$(node -p "require('./tv-app/appinfo.json').version")"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
REL="$ROOT/release"

mkdir -p "$REL"
[ "$REL" = "$ROOT/release" ] || exit 1
find "$REL" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

cp build/*.ipk "$REL/"
mkdir -p "$REL/build"
cp build/*.ipk "$REL/build/"
cp -R scripts docs diagnostics "$REL/"
mkdir -p "$REL/ios"
rsync -a --exclude '.build' --exclude '.swiftpm' --exclude '*.xcuserstate' ios/ "$REL/ios/"
cp package.json package-lock.json "$REL/"
mkdir -p "$REL/tv-service" && cp tv-service/package.json tv-service/package-lock.json "$REL/tv-service/" 2>/dev/null || true
printf '%s\ncommit %s\nbuilt %s\n' "$VERSION" "$COMMIT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$REL/VERSION"

cat > "$REL/README.txt" <<TXT
V/TV Sleep $VERSION (commit $COMMIT) - reinstall from scratch

Tested only on LG 43NU885BPLA, firmware 43.04.26, webOS SDK 11.0.1.

Contents: the .ipk, build/ (same .ipk, where scripts expect it), scripts/, docs/,
diagnostics/, ios/ source (no .build), VERSION. The TV app/service source is in the
git repository, not here; this folder reinstalls the packaged .ipk only.

1. Mac: install Node and npm (brew install node). In this folder run
     scripts/setup-webos.sh
   (installs the webOS CLI 3.2.6 from package.json; tv-service/package.json is included
   only so this script runs).
2. TV: install the "Developer Mode" app from the LG Content Store, sign in, switch
   Developer Mode and the Key Server on, note the TV IP and the 6-character passphrase.
3. Connect:      scripts/connect-tv.sh <TV_IP>
4. Install:      scripts/install-tv.sh        (installs build/*.ipk)
5. On the TV:    Home -> V/TV Sleep.
6. Pair the Mac: scripts/vtvctl.sh pair --host <TV_IP>   (needs Swift toolchain, accept the TV prompt)

Developer Mode expires (about 1000 h). Extend with the Extend button in the TV's
Developer Mode app; after expiry repeat steps 2-4. See docs/dev-mode.md and
docs/troubleshooting.md.
TXT

echo "release/ ready: $REL"
ls -la "$REL"
