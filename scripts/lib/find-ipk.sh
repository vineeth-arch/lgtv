# Sourced helper: sets IPK to the newest build/*.ipk or exits with a helpful error.
IPK="$(ls -1t "$ROOT"/build/*.ipk 2>/dev/null | head -1 || true)"
if [ -z "$IPK" ]; then echo "error: no .ipk in build/. Run scripts/build-tv.sh first." >&2; exit 1; fi
