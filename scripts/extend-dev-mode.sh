#!/usr/bin/env bash
# Extends the TV Developer Mode session (resets the countdown).
# Runs `ares-extend-dev` if the installed webOS CLI ships it; otherwise prints the TV-side steps.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/env.sh"

cat <<'TXT'
Developer Mode session: extend before it reaches 0 h.
  1. On the TV, open the "Developer Mode" app.
  2. Read "Dev Mode Session" (remaining hours; about 1000 h right after an extend).
  3. Select "Extend" (the Extend button). The counter resets.
At 0 h the TV uninstalls all developer-mode apps, including V/TV Sleep.
If that already happened, reinstall with scripts/install-tv.sh (see docs/dev-mode.md).
TXT

if command -v ares-extend-dev >/dev/null 2>&1; then
  echo
  echo "ares-extend-dev found in the installed CLI; running it for device '$VTV_DEVICE'."
  ares-extend-dev --device "$VTV_DEVICE"
else
  echo
  echo "ares-extend-dev is not in the installed webOS CLI (3.2.6 does not ship it)."
  echo "Use the Extend button on the TV as described above; nothing was run."
fi
