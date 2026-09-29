# Developer Mode: expiry, extending, reinstalling

V/TV Sleep is a developer-mode app. The TV only keeps such apps while its Developer Mode session has time left. Verified on TV 43NU885BPLA, firmware 43.04.26, webOS SDK 11.0.1.

## Check the remaining time

Open the **Developer Mode** app on the TV. It shows the session's remaining hours. Right after an extend it showed about 1000 h. There is no Mac-side check in this repo; `ares-extend-dev` and any CLI query for the session are not part of `@webos-tools/cli` 3.2.6 (the version installed by `scripts/setup-webos.sh`).

## Extend

In the Developer Mode app, select the **Extend** button. Do this well before 0 h. `scripts/extend-dev-mode.sh` prints these steps, and runs `ares-extend-dev` only if a future CLI provides that command (it checks with `command -v`); with CLI 3.2.6 it just prints the instructions.

## What happens at 0 h

The TV uninstalls developer-mode apps, so V/TV Sleep and its service disappear. Whether a pending timer still fires after the service is removed has not been tested; assume it will not. The iPhone app and Shortcuts will then fail to find V/TV on the TV. Nothing on the Mac or iPhone is damaged.

## Reinstall after expiry

1. On the TV, turn Developer Mode back on (Developer Mode app) and note the IP and whether the Key Server is on.
2. On the Mac, from the repo root:
   ```
   scripts/connect-tv.sh <TV_IP>     # only if the key or IP changed; asks for the passphrase shown on the TV
   scripts/build-tv.sh               # only if there is no build/*.ipk (runs npm test first)
   scripts/install-tv.sh
   ```
   From a release folder, run `scripts/install-tv.sh` after copying the `.ipk` into `build/` (see `release/README.txt`).
3. Pair again from the Mac or iPhone if the TV asks (see README, "Pairing"). Local SSAP pairing state is stored on the TV inside the service data directory, so a reinstall may clear it. Whether a prompt appears on a fresh install (test H5) has not been run on the TV.

## Content Store

Only an app published through the LG Content Store is permanent; it does not depend on Developer Mode. This project does not do that. Every other route needs the periodic Extend.
