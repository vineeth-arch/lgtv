# iOS app: GitHub Actions to TestFlight

The workflow `.github/workflows/ios-testflight.yml` builds `ios/VTVRemote` on a GitHub macOS runner and uploads it to TestFlight. No Xcode is needed on your Mac. One-time setup below.

You need a paid Apple Developer Program membership.

## 1. Private GitHub repository

The repository is created and pushed with the `gh` CLI (`gh repo create <name> --private --source . --push`). Keep it private. Everything below assumes the repo exists and `gh` is logged in.

## 2. Register the bundle ID

App Store Connect can only pick bundle IDs that already exist.

1. Open developer.apple.com/account and sign in.
2. Certificates, Identifiers & Profiles, then Identifiers, then the **+** button.
3. Choose **App IDs**, Continue, choose **App**, Continue.
4. Description: `V/TV Remote`. Bundle ID: choose **Explicit** and enter `com.designinnsaeit.vtvremote`.
5. Leave capabilities as they are (none needed), Continue, Register.

## 3. Create the app in App Store Connect

1. Open appstoreconnect.apple.com, then Apps, then the **+** button, then **New App**.
2. Platforms: iOS. Name: `V/TV Remote` (if taken, use another name; the home-screen name stays "V/TV Remote"). Primary language: English.
3. Bundle ID: pick `V/TV Remote - com.designinnsaeit.vtvremote` from the list. SKU: `vtvremote`. User access: Full Access.
4. Create.

## 4. Create the API key

1. In App Store Connect: Users and Access, then the **Integrations** tab, then **App Store Connect API**, then **Team Keys**.
2. Click **Generate API Key** (or the **+**). Name: `GitHub Actions`. Access: **App Manager**. Generate.
3. Note the **Key ID** (in the table) and the **Issuer ID** (shown at the top of the page).
4. Click **Download API Key**. This works only once. You get `AuthKey_XXXXXXXXXX.p8`.

Your Team ID: developer.apple.com/account, then Membership details, then **Team ID** (10 characters).

## 5. Set the secrets and variable

Run these yourself in a terminal inside the repo. The `.p8` never leaves your Mac except into GitHub's encrypted secret store.

```sh
gh secret set ASC_KEY_ID --body "XXXXXXXXXX"
gh secret set ASC_ISSUER_ID --body "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
gh secret set ASC_KEY_P8 < ~/Downloads/AuthKey_XXXXXXXXXX.p8
gh variable set APPLE_TEAM_ID --body "YYYYYYYYYY"
```

Then delete the downloaded `.p8` or move it into a password manager.

## 6. Run the build

Push any change under `ios/`, or run it by hand:

```sh
gh workflow run "iOS TestFlight"
gh run watch
```

The build number is the run number, so every run is unique. A run takes about 10 to 15 minutes. After upload, Apple processes the build for a few minutes; you get an email when it is ready.

The first run may fail on signing if Apple has not created the certificate yet; re-running usually fixes it (`-allowProvisioningUpdates` creates the distribution certificate and profile through the API key). If the log says the key lacks permission, check that the role is App Manager (Admin also works).

## 7. Install on the iPhone

1. Install **TestFlight** from the App Store on the iPhone.
2. App Store Connect, your app, **TestFlight** tab. Under Internal Testing click **+** next to "Internal Testing", create a group (for example `Me`), and add yourself (your Apple ID must be a user of the team; you are already).
3. Add the processed build to the group. The first time, answer the export-compliance question if asked (the app declares no non-exempt encryption).
4. Open TestFlight on the iPhone, accept the invite, tap **Install** on V/TV Remote.
5. Open V/TV Remote once, allow **Local Network** access when iOS asks, enter the TV's IP address and tap **Pair**. Choose Yes on the TV.

## 8. Every 90 days

TestFlight builds expire 90 days after upload. Re-run the workflow (`gh workflow run "iOS TestFlight"`) and update in TestFlight. The App Store Connect API key itself does not expire until you revoke it.

## Cost and privacy notes

The repo must stay private (the workflow uses secrets). macOS minutes on private repos are billed at 10x on the free plan; one build is roughly 10 to 15 minutes, so a handful of builds per month is fine.
