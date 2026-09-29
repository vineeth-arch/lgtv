# V/TV Sleep — test results

TV: 43NU885BPLA, firmware 43.04.26, webOS SDK 11.0.1. Evidence = service log (`data/log.json` on the TV) plus what the user saw. Times UTC.

| Test | Result | Evidence |
|---|---|---|
| A. 2-min timer, V/TV app open | PASS | User pressed TEST 2 MIN; TV off at +2 min; log 13:21:57 `power-off ok` via `localSsapTurnOff` |
| B. App closed, other app playing | PASS (YouTube) | `vtvctl timer 2` with YouTube playing, TV off at 13:54:58 (user confirmed). Netflix / HDMI not yet tried |
| C/D. Sent from a remote client, then client offline | PARTIAL | Mac `vtvctl` is the client. Mac's own state not changed during the wait; full C/D needs the iPhone app |
| E. Mac not involved | PASS | Timer set with `ares-novacom`/`vtvctl` only during launch; TV fired 2 min later with no Mac traffic |
| F. Cancel before expiry | PASS | log 14:10:16 `scheduled` → 14:10:23 `cancelled`; TV up at 14:13:10 (deadline was 14:12:11) |
| G. Replace 2 → 5 min | PASS (old timer) | log 14:05:54 `scheduled 2` → 14:06:07 `scheduled 5`; TV up at 14:09:01, past old deadline 14:07:54. The 5-min timer was then overwritten by test F, so its firing was not observed in this run |
| H1. Service killed mid-timer | PASS | Service idle-exits within ~30 s; timers still fired (runs above) |
| H2. Stale fire (TV off by remote mid-timer, on after deadline) | TODO | needs user with remote |
| H3. Standby mid-timer | TODO | needs user |
| H4. Power unplug mid-timer | TODO | needs user |
| H5. Fresh pairing prompt | TODO | Local SSAP registered with no visible prompt; Mac `vtvctl pair` showed a prompt path (user accepted) |

## Findings
- Power-off works only through local SSAP (`wss://127.0.0.1:3001`); Luna `turnOff` does not exist and `machineOff` is denied (`diagnostics/power-capabilities.json`).
- Launching V/TV from the phone/Mac takes the foreground. YouTube is closed by the TV and reopens paused; relaunch and `PalmSystem.deactivate()` both behave the same (see `docs/PLAN.md`).
- V/TV cold start takes 3–4 s before it calls the service; client waits 7 s after launch.
- `luna-send-pub` from the Mac needs `-i`; the first call after the service idles can return empty, retry up to 3 times.
