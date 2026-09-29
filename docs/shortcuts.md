# iPhone shortcuts

V/TV Remote ships its shortcuts as App Shortcuts. There is nothing to import: after the TestFlight build is installed they appear by themselves in the Shortcuts app and in Siri.

One-time: open V/TV Remote, allow Local Network, enter the TV IP and tap Pair (see `docs/ios-ci.md`, step 7). The shortcuts fail with "not paired" until this is done.

## What you get

| Shortcut | What it does |
|---|---|
| 📺 TV 30 | Turns the TV off in 30 minutes |
| 📺 TV Timer | Menu: 30, 45, 60, 90 minutes, 2 hours, Custom (asks minutes), Cancel timer, Turn off now |
| Cancel TV Timer | Cancels the timer |
| Turn TV Off | Turns the TV off now |

Siri: "TV thirty with V/TV Remote", "TV timer in V/TV Remote". Also available as building blocks (Set TV Sleep Timer with 1 to 720 minutes) when you search "TV" in the Shortcuts app's action list.

## Timing and what to expect

Each run takes about 10 seconds. The phone briefly launches the V/TV app on the TV, which hands the timer to the TV's own service, and then the phone is done. The TV turns itself off later without the phone.

Side effect: while it launches, V/TV takes over the TV screen. Whatever was playing (for example YouTube) is closed and reopens paused afterwards. This is a webOS limitation, see the finding in `docs/PLAN.md`. After the shortcut reports "TV will turn off at 11:42 PM", you can lock the phone or leave the network.

The dialog reads for example: "LG TV sleep timer set for 30 minutes. TV will turn off at 11:42 PM." On failure it says why (TV unreachable, not paired, pairing rejected).

## Put "📺 TV 30" on the Home Screen (5 taps)

1. Shortcuts app, tap **+** (new shortcut).
2. Search `TV 30` and tap the **📺 TV 30** action.
3. Tap the name at the top, rename it `TV 30`.
4. Tap the name again, then **Add to Home Screen**.
5. Tap **Add**.

## Put it in Control Center

1. Swipe down to open Control Center, touch and hold an empty area, tap **Add a Control**.
2. Search `Shortcuts`, pick the **Shortcut** control, tap it to add.
3. Tap the control's **Choose** button and select `TV 30` (the shortcut you made above).
4. Tap **Done**.

You can also bind the shortcut to the Action Button: Settings, Action Button, Shortcut, choose `TV 30`.

## Menu shortcut, manual fallback (5 taps)

If "📺 TV Timer" does not show up automatically (it can take a minute after install), build the same thing by hand:

1. Shortcuts app, **+**.
2. Search `TV Timer`, tap the **📺 TV Timer** action.
3. Tap **Option** and choose **Ask Each Time** (so a menu appears every run).
4. Tap the name at the top, rename it `TV Timer`.
5. Tap **Done**. Add it to the Home Screen as above if you want.

For a fixed custom time (say 75 minutes), use the **Set TV Sleep Timer** action instead of the menu and type the minutes.

## From the Mac (works today, no Apple Developer account)

`vtvctl` talks to the TV directly, like the iPhone app would. After the one-time pair (`scripts/vtvctl.sh pair --host <TV_IP>`, accept the prompt on the TV):

```bash
scripts/vtvctl.sh timer 30     # TV off in 30 min
scripts/vtvctl.sh cancel       # cancel the timer
scripts/vtvctl.sh off          # TV off now
```

Optional shell aliases (add to `~/.zshrc`, adjust the path):

```bash
alias tv30='"/Users/vineethnair/Vibe Code/LGTV/scripts/vtvctl.sh" timer 30'
alias tvoff='"/Users/vineethnair/Vibe Code/LGTV/scripts/vtvctl.sh" off'
```

The Mac is only the sender: once the command returns, the TV owns the timer. Sending takes about 10 s and briefly shows V/TV on the TV screen.

## iPhone without the iOS app (not possible with a new key)

An iPhone Shortcut could use "Run Script over SSH" to run `luna-send-pub` on the TV over the developer SSH port (9922). Adding a dedicated phone key does **not** work: on this TV (firmware 43.04.26) `/media/developer/.ssh/authorized_keys` is owned by another account and the `prisoner` login gets `Permission denied` when appending. Only the Key Server can issue access.

The only remaining variant is copying the existing developer key (`~/.ssh/tv_webos`, protected by the Key Server passphrase) to the phone. That was **not tried**: it puts the TV's developer login on the phone, and whether the Shortcuts SSH action accepts that key is unverified. For a phone tap, use the iOS app (needs the paid Apple Developer Program, see `docs/ios-ci.md`).
