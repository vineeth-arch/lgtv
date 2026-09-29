# Troubleshooting

Symptoms seen while building this project on TV 43NU885BPLA (firmware 43.04.26, webOS SDK 11.0.1). Fixes marked "untested" are reasonable steps, not verified on the TV.

## ares: key or passphrase failures

Symptom: `scripts/connect-tv.sh` or `ares-novacom --getkey` fails, asks repeatedly for the passphrase, or cannot reach the TV.

- The key is served by the TV's Key Server on port 9991. If that port is closed, the fetch cannot work. In the TV's Developer Mode app, make sure Developer Mode and the Key Server are both on, then retry.
- The passphrase (6 characters) is shown in the Developer Mode app and can change when Developer Mode is toggled or the TV reboots. Use the one currently on screen.
- Check the device: `ares-setup-device --list` should show `tv` with the TV's IP, port 9922, user `prisoner`. Re-run `scripts/connect-tv.sh <TV_IP>` after an IP change.
- The Mac and TV must be on the same network. The TV's IP can change; a DHCP reservation avoids this.

## luna-send-pub returns nothing or errors

- Over `ares-novacom --run`, use `luna-send-pub -i` (the `-i` flag is required). `scripts/test-tv.sh` does not change the command you type; for direct use:
  `ares-novacom --device tv --run "luna-send-pub -i -w 20000 -f luna://com.designinnsaeit.vtvsleep.service/status '{}'"`
- The first call after the service has idled out (about 30 s) can return empty because the service is being started. Retry, up to 3 times.

## /tmp is not writable

The TV's `prisoner` user cannot write to `/tmp`. Use `/media/developer/temp` for scratch files on the TV.

## Timer not set from the phone or Mac

The client launches V/TV with `{mode, minutes}` and must stay connected until the app has called the service. V/TV cold-starts in 3-4 s, so the client waits 7 s. If the client (or the phone) leaves earlier, the launch happens but the timer may not be set. Check with `scripts/test-tv.sh status`, or open V/TV on the TV and read the status. Retry and keep the phone awake for about 10 s.

Related: launching V/TV takes the foreground, so the app that was playing (e.g. YouTube) is closed and reopens paused. This is known and not fixable from V/TV; see README, Limitations.

## Node version on the TV

The TV runs Node v20.12.2. The service and its vendored `ws` dependency must work on that version; do not raise the service's requirements beyond it. The Mac tooling uses a different Node (repo scripts prefer Homebrew `node@24` when present; CLI 3.2.6 was verified with Node 26.4). Run `scripts/check-environment.sh` if the Mac side misbehaves.

## Pairing prompts

- `vtvctl pair --host <TV_IP>` shows a prompt on the TV. Accept within 60 s; otherwise pairing times out. Run it again.
- "TV certificate changed": the pinned certificate no longer matches. If you replaced or reset the TV, run `vtvctl pair --host <TV_IP> --reset-pin`.
- "Not paired" or "pairing rejected": pair again and accept the prompt. Some TVs also need "LG Connect Apps" enabled in network settings (untested on this TV).
- Whether a prompt appears when the TV service itself registers over local SSAP after a fresh install has not been tested (test H5).
- If the TV is off or unreachable, the client reports it as unreachable; check the IP and that the TV is on.

## Apps or timers disappeared: Developer Mode expired

Symptom: V/TV Sleep is gone from the TV, or the app cannot be launched. The Developer Mode session reached 0 h and the TV removed developer apps. Turn Developer Mode on again, then run `scripts/install-tv.sh`. Full steps: `docs/dev-mode.md`. Prevent it with the Extend button in the TV's Developer Mode app.

## Build and install

- `scripts/build-tv.sh` fails with "ws missing": run `scripts/setup-webos.sh`.
- `scripts/build-tv.sh` stops at `npm test`: a unit test failed; fix that before packaging.
- `scripts/install-tv.sh` says no `.ipk`: run `scripts/build-tv.sh` (or copy the release `.ipk` into `build/`).
