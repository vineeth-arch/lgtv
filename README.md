# V/TV Sleep

A Mac-independent sleep timer prototype for LG webOS TV.

## Design
- iPhone sends a short request; it does **not** wait 30 minutes.
- TV-side JavaScript service schedules a persistent Activity Manager callback.
- At expiry the service attempts the retail-TV-safe shutdown path first.
- Includes capability-test hooks because privileged Luna shutdown APIs may be blocked on retail firmware.

## Important limitation
LG documents Activity Manager and background JS services for webOS TV, but direct `com.webos.service.sleep/shutdown/machineOff` requires privileged `sleep.management` access in webOS OSE. Therefore this package intentionally does not claim that direct shutdown will work on your retail NU885 until tested. The reliable retail fallback is SSAP `ssap://system/turnOff`, which normally must be issued by another LAN client. If the TV blocks self-directed SSAP, an always-on LAN node is required for guaranteed unattended shutdown.

## Files
- `app/`: minimal TV UI to arm/cancel/test timer
- `service/`: TV background service and Activity Manager scheduler
- `iphone-shortcut/SETUP.md`: iPhone integration plan

## Install prerequisites
Install LG webOS TV CLI / VS Code webOS Studio, enable Developer Mode on the TV, pair the TV as a target, then package app + service together.

## First test sequence
1. Install package.
2. Launch V/TV Sleep.
3. Run **Power capability test**.
4. If `machineOff` permission is denied, keep the scheduler but configure a LAN shutdown endpoint (recommended future Omen/home-server/ESP32 node).
5. Test a 2-minute timer before using 30 minutes.
