# V/TV Sleep — Project Plan

Living document. Updated 2026-09-29. Authored on Opus, executed on Sonnet.

## Goal

iPhone → LG TV → the TV stores the timer → the TV turns itself off.
After the command is sent: no iPhone Wait action, no Mac, no server, no cloud in the runtime path. The Mac is used only for development and installation.

## Hardware (verified on the real TV)

| Field | Value |
|---|---|
| Model | 43NU885BPLA.DTRDLJL |
| Firmware | 43.04.26 |
| webOS SDK | 11.0.1 |
| OTA id | HE_DTV_W26N_AFADATAA |
| Node on TV | v20.12.2 |
| TV IP (Wi-Fi) | 192.168.29.224 |
| Mac tooling | @webos-tools/cli 3.2.6 on Node 26.4 (repo devDependency) |

## Status

| Step | What | State |
|---|---|---|
| 1 | Baseline + git | ✅ done |
| 2 | Mac environment, webOS CLI | ✅ done (`ares-extend-dev` not shipped in CLI 3.2.6) |
| 3 | TV service (timer, state, power chain, SSAP) + unit tests | ✅ done, 39 tests |
| 4 | TV app probe UI | ✅ done |
| 5 | Package `.ipk` | ✅ done |
| 6 | Connect TV (Developer Mode, key) | ✅ done |
| 7 | Install + capability experiments, gates G1–G3 | ✅ **all gates pass** |
| 8 | Real 10-foot TV UI | ⏳ next |
| 9 | `vtvctl` Mac SSAP proof (VTVCore Swift package) | ⏳ next, runs in parallel with 8 |
| 10 | Test plan A–H on the real TV | ⏳ after 8 + 9 |
| 11 | iOS app + App Intents + GitHub Actions → TestFlight | later |
| 12 | Shortcuts doc | later |
| 13 | Developer Mode expiry doc + script | later |
| 14 | README, troubleshooting, `release/` | later |

## What step 7 proved (evidence in `diagnostics/`)

| Method | Result |
|---|---|
| Luna `com.webos.service.tvpower/power/turnOff` | ❌ `Unknown method "turnOff" for category "/power"` |
| Luna `com.webos.service.sleep/shutdown/machineOff` | ❌ `Denied method call "machineOff" for category "/shutdown"` |
| Luna `tvpower/power/getPowerState` | ❌ denied (not needed) |
| Activity Manager create / cancel / complete | ✅ works from the dev service |
| `com.webos.notification/createToast` | ✅ works |
| **Local SSAP `wss://127.0.0.1:3001` → `ssap://system/turnOff`** | ✅ **TV powered off, first attempt** |
| State + client key in `…/services/com.designinnsaeit.vtvsleep.service/data` | ✅ persists |

Two real 2-minute runs switched the TV off: one started from the TV app, one scheduled from the Mac with the app closed. The service had idle-exited in between and was restarted by Activity Manager, so "timer survives app close and service termination" is already demonstrated.

Open question: local SSAP registration produced a client key without the user noticing a prompt. Record in step 10 whether a prompt appears after a fresh install (key file deleted).

Mac → service channel that works: `ares-novacom --device tv --run "luna-send-pub -i -w 20000 -f luna://com.designinnsaeit.vtvsleep.service/<method> '<json>'"`. The first call after the service is idle sometimes returns empty; retry up to 3 times. `/tmp` is not writable for `prisoner`; `/media/developer/temp` is.

---

## Step 8 — Real TV UI (executor: Sonnet)

**Scope:** `tv-app/` only (`index.html`, `style.css`, `app.js`; `bridge.js` gains a browser stub). No service changes unless a bug is found (then add a test).

**Skills:** load `frontend-design` and `impeccable` before writing UI.

### Screen (1920×1080, 96 px safe margin)

```
V/TV SLEEP                                   (brand line, small caps)

[ 30 ]  [ 45 ]  [ 60 ]  [ 90 ]  [ CUSTOM ]   (one row, big targets ≥ 220×160)

TIMER STATUS
Off at   11:42 PM
Remaining  27 min                            (or "No timer set")

[ CANCEL TIMER ]                             (disabled look + skipped by focus when no timer)
```

- Type: title 64–72 px, buttons 64 px numerals + small "MIN", status 48 px. System font stack (`"LG Smart UI", "Helvetica Neue", Arial, sans-serif`), no web fonts (TV may be offline).
- Dark background (not pure black; avoids OLED/LCD bloom), one accent colour for focus. Contrast ≥ 7:1 for text.
- Focus: accent border + 1.05 scale, 120 ms ease-out. `prefers-reduced-motion` respected.

### Custom panel

Replaces the button row in place: `[ − ]  45 MIN  [ + ]  [ SET ]`. ± steps 5 min, range 5–720. Number keys 0–9 (keyCodes 48–57, 96–105) type minutes directly (3-digit max, 1.5 s entry window). Back closes the panel.

### Input model

- Every focusable has `data-nav` coordinates; ←→↑↓ (37–40) move focus, Enter (13) activates.
- Magic Remote: `mouseover` moves focus to the hovered element; click activates.
- Back (461, also Escape 27 in browser): closes the dev panel, custom panel or overlay; at the root it does nothing (no exit popup).
- Initial focus on **30**.

### Status

Call `status` on load, after every action, every 30 s while visible (pause on `visibilitychange` hidden), and on `webOSRelaunch`. Off-at uses the TV's local time `toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})`. Remaining in whole minutes rounded up; "< 1 min" under 60 s.

### Launch-param confirmation (from iPhone / `vtvctl`)

On `webOSLaunch` / `webOSRelaunch` / `PalmSystem.launchParams` with `mode`, call `handleLaunch`, then show a full-screen overlay for 4 s:
`✓ TV OFF IN 30 MIN` + `11:42 PM` (or `✓ TIMER CANCELLED`, or the service error text in red). Deduplicate the same params within 3 s (existing logic). Then return to the main screen.

### Hidden dev panel

Toggle with the RED key (403) or by pressing `0` five times within 3 s. Contents: TEST 2 MIN · TEST POWER OFF (confirm step: "This turns the TV off now. Press OK again.") · TEST ACTIVITY MANAGER (`capabilityTest`) · PAIR LOCAL · DIAGNOSTICS. Output in a scrollable monospace `<pre>`.

### Browser stub

`bridge.js`: if `PalmServiceBridge` is missing, use an in-memory fake implementing `status`/`schedule`/`cancel`/`handleLaunch`/`capabilityTest`/`diagnostics` so the UI works in a desktop browser. `?launch={"mode":"schedule","minutes":30}` in the URL simulates launch params.

### Acceptance

1. `node --check tv-app/*.js`; `npm test` still green.
2. Open `tv-app/index.html` in the Browser pane at 1920×1080: screenshot main screen, custom panel, confirmation overlay, dev panel. Keyboard-only walkthrough works (arrows, Enter, Escape).
3. `scripts/build-tv.sh` → `.ipk`. Do NOT install on the TV (the orchestrator does that).
4. Commit: `Step 8: 10-foot TV UI`.

---

## Step 9 — `vtvctl` Mac SSAP proof (executor: Sonnet, parallel with step 8)

**Scope:** new `ios/VTVCore/` Swift package, reused by the iOS app in step 11. Built with Command Line Tools (Swift 6.4, macOS 27) — no Xcode.

### Package

```
ios/VTVCore/Package.swift        platforms: macOS 13, iOS 17; products: VTVCore (lib), vtvctl (exe), vtvcore-selfcheck (exe)
Sources/VTVCore/SSAPClient.swift  connect, register/pair, request/response by id, close
Sources/VTVCore/TLSPinning.swift  URLSessionDelegate: accept the TV's self-signed cert, TOFU SHA-256 pin of the leaf cert
Sources/VTVCore/TimerCommand.swift validation (integer 1–720), launch params, off-time, user-facing strings
Sources/VTVCore/CredentialStore.swift protocol { clientKey, certPin, host }; FileCredentialStore (0600, ~/.config/vtv/tv.json) for the CLI
Sources/VTVCore/TVRemote.swift    high-level: setTimer(min), cancelTimer(), turnOff(), foregroundApp()
Sources/vtvctl/main.swift
Sources/vtvcore-selfcheck/main.swift
```

### SSAP details

- `wss://<host>:3001`, `URLSessionWebSocketTask`. Unsigned manifest identical in permissions to `tv-service/lib/ssap.js` (`LAUNCH, CONTROL_POWER, READ_RUNNING_APPS, READ_APP_STATUS, READ_POWER_STATE, WRITE_NOTIFICATION_TOAST`).
- Register: send `{type:"register", id:"register_0", payload:{forcePairing:false, pairingType:"PROMPT", manifest, "client-key"?}}`. Expect optionally `{type:"response", payload:{pairingType:"PROMPT"}}` (prompt shown), then `{type:"registered", payload:{"client-key"}}`. Pair timeout 60 s, otherwise 8 s.
- Cert: first connect stores the SHA-256 of the leaf DER. Later connects must match, else fail with "TV certificate changed — re-pair". `vtvctl pair --reset-pin` clears it.
- Errors mapped to clear messages: unreachable / TV off, not paired, pairing rejected, cert changed, timeout.

### High-level flow `setTimer(minutes)`

1. Validate minutes (reject, don't clamp).
2. Connect + register with the saved key.
3. `ssap://com.webos.applicationManager/getForegroundAppInfo` → `appId` (ignore failure).
4. `ssap://system.launcher/launch` `{id:"com.designinnsaeit.vtvsleep", params:{mode:"schedule", minutes}}`.
5. Wait 1.5 s (the app calls the service immediately on launch).
6. If the prior `appId` exists and isn't V/TV or the home launcher → `launch {id: prior}` so Netflix etc. comes back.
7. Close. Return `{minutes, offAt, restoredApp}`.

`cancelTimer()` is the same with `{mode:"cancel"}`. `turnOff()` = `ssap://system/turnOff`.

### CLI

```
vtvctl pair --host 192.168.29.224 [--reset-pin]
vtvctl timer <minutes>
vtvctl cancel
vtvctl off
vtvctl foreground
```

Output one line of human text plus `--json` option. Exit code non-zero on failure.

### Self-check

`swift run vtvcore-selfcheck` (assert-based; used because Command Line Tools may lack XCTest): validation bounds and rejection, launch-param JSON shape, register message JSON, off-time formatting, response routing by id, cert-pin compare.

### Acceptance

1. `swift build` and `swift run vtvcore-selfcheck` pass locally.
2. `scripts/vtvctl.sh` wrapper builds (release) and runs the binary.
3. Do NOT contact the TV (the orchestrator does that with the user present).
4. Commit: `Step 9: VTVCore Swift package + vtvctl`.

### On-TV run (orchestrator + user)

1. `vtvctl pair --host 192.168.29.224` → **user accepts the prompt on the TV**.
2. `vtvctl foreground` with YouTube open → records whether `getForegroundAppInfo` is allowed for an unsigned manifest.
3. YouTube playing → `vtvctl timer 2` → V/TV confirmation appears briefly → YouTube comes back → TV off at +2 min.
4. Record in `diagnostics/ssap-remote.md`.

---

## Step 10 — Test plan A–H (orchestrator + user)

All timers are 2 min unless stated. The evidence for every test is the service log (`diagnostics` method) plus what the user saw. Results go in `diagnostics/test-results.md` (steps, expected, actual, evidence, pass/fail).

| Test | Setup / action | Who | Expected | Pass evidence |
|---|---|---|---|---|
| A | TV UI: press 2-min test, leave V/TV open | user | TV off at +2 min | ✅ already passed (log 13:21:57Z) — re-run once with the final UI |
| B | TV UI: set 2 min, press Home, open YouTube/Netflix/HDMI | user | TV off at +2 min while the other app plays | `power-off ok` log entry |
| C | `vtvctl timer 2` from the Mac, then close the Mac lid immediately | me + user | TV off at +2 min | log entry, Mac asleep |
| D | Same as C, then turn Mac Wi-Fi off after the command returns | me | TV off at +2 min | log entry |
| E | Set via TV UI, put the Mac to sleep | user | TV off | log entry (Mac irrelevant) |
| F | Set 2 min, cancel from TV UI after 30 s | user | TV stays on past +3 min | `cancelled` log, no `power-off` |
| G | Set 2 min, then set 5 min within 30 s | user | Nothing at +2, TV off at +5 | only one `power-off`, at +5 |
| H1 | Service restart mid-timer: set 3 min, wait (service idle-exits after 30 s) | me | TV off at +3 | log entry (already shown in step 7) |
| H2 | **Stale fire:** set 3 min, remote power-off at +1, power on at +6 | user | TV stays on after power-on | `stale` log or no `power-off` |
| H3 | Standby mid-timer: set 3 min, remote off at +1, on at +2 | user | Record behaviour (fires at +3, or not) | log |
| H4 | Full reboot: set 5 min, unplug TV 30 s at +1, replug | user | Record whether the persistent Activity survives | log |
| H5 | Fresh pairing: delete `client-key.json`, run PAIR LOCAL | me + user | Record whether a TV prompt appears | screenshot/answer |

When the iPhone app exists (step 11), C and D are repeated with the iPhone: lock the phone right after the command (C), and turn off the phone's Wi-Fi (D).

H3 and H4 are "record behaviour" tests, not pass/fail. If H4 shows the timer is lost on reboot, document it as a known limitation (a reboot also clears the need for the timer in most cases).

---

## Steps 11–14 (summary; detailed later)

- **11 iOS:** `ios/VTVRemote` (XcodeGen `project.yml`) depends on VTVCore. Keychain `CredentialStore`. App Intents: Set TV Sleep Timer (1–720), Cancel TV Sleep Timer, Turn TV Off, TV 30, TV Timer menu (AppEnum). `AppShortcutsProvider` phrases include the app name. `NSLocalNetworkUsageDescription`, `ITSAppUsesNonExemptEncryption=false`. GitHub Actions macOS → `xcodegen` → archive with App Store Connect API key → upload to TestFlight. User: private repo (confirm before push), App Store Connect app record, API key, secrets, TestFlight install.
- **12 Shortcuts:** App Shortcuts appear automatically; doc for Home Screen / Control Center placement.
- **13 Developer Mode:** CLI 3.2.6 has no `ares-extend-dev`; extend with the TV app's Extend button. Session 1000 h; at expiry dev apps are uninstalled; reinstall with `scripts/install-tv.sh`. Only permanent legit route: LG Content Store.
- **14 Release:** README with Mermaid diagram, troubleshooting, `release/` with ipk, scripts, docs, diagnostics, iOS source.

## Rules for executors

- Never claim an API works without on-TV evidence. Never hide failures.
- No `setTimeout` timers for the sleep timer itself; no keep-alive loops; no exploits or rooting.
- Pause only for actions that need the user physically.
- Commit after each step.
