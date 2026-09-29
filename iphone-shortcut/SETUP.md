# iPhone Shortcut design

Do NOT use a 30-minute Wait action.

## Desired shortcut
Name: `TV 30`

The shortcut should make a single request to the scheduler and terminate immediately.

### Phase A — TV-only
Once the webOS service is installed and a reachable local command ingress is confirmed, the shortcut calls `arm(minutes=30)`.

### Phase B — guaranteed fallback
If retail webOS blocks direct shutdown, run a tiny always-on LAN bridge on an ESP32/Raspberry Pi/Omen server. The iPhone calls:

`POST /tv/sleep` with `{ "minutes": 30 }`

The bridge persists the deadline, sends `ssap://system/turnOff` at T+30, checks/retries at +10s/+30s, and then clears the job.

This keeps the iPhone and Mac out of the timing path.
