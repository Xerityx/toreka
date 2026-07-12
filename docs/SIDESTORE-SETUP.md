# SideStore Setup — Install Toreka on Your iPhone (No Mac, Free Apple ID)

One-time setup: **~30 minutes**. After this, installing new Toreka builds takes ~2 minutes, and SideStore auto-refreshes the 7-day signature in the background.

> Authoritative, always-current instructions live at **https://docs.sidestore.io** — if anything below looks different from what you see, follow the official docs.

## What you need

- Your iPhone (iOS 17/18+ is fine) + USB cable
- This Windows PC
- Your free Apple ID (no $99 developer account)
- ~20 min of patience for the one-time pairing dance

## Why this works

Apple lets any Apple ID sign apps for personal development use (valid 7 days, max 3 apps). SideStore is an app store that lives **on the iPhone itself** and re-signs apps with your Apple ID — including automatic background refresh before the 7 days expire, using a local VPN trick (WireGuard) so no computer is needed after setup.

## Part 1 — One-time install of SideStore (uses the PC)

1. **Install iTunes and iCloud from Apple's website** (NOT the Microsoft Store versions — SideStore/AltServer need the Apple-installer versions for device drivers):
   - iTunes: https://www.apple.com/itunes/download/win64
   - iCloud: https://support.apple.com/en-us/103232 (choose the "Windows (from Apple)" installer)
2. **Install AltServer for Windows** from https://altstore.io — it runs in the system tray. Connect your iPhone via USB, unlock it, and "Trust This Computer" when prompted.
3. **Download the latest SideStore.ipa** from https://github.com/SideStore/SideStore/releases
4. In the AltServer tray icon menu: **Sideload .ipa** → pick `SideStore.ipa` → enter your Apple ID + password (it's sent only to Apple; both AltServer and SideStore are open source).
   - If your Apple ID has 2FA you may need an app-specific password: https://account.apple.com → Sign-In and Security → App-Specific Passwords.
5. On the iPhone: **Settings → General → VPN & Device Management** → trust your Apple ID developer profile.

## Part 2 — One-time pairing file + WireGuard

1. On the PC, download **jitterbugpair** (Windows build) from https://github.com/osy/Jitterbug/releases. Run `jitterbugpair.exe` with the iPhone connected + unlocked → it produces a `YOUR-UDID.mobiledevicepairing` file.
2. Send that file to the iPhone (AirDrop alternative on Windows: email it to yourself, or use iCloud Drive / Files).
3. On the iPhone, install **WireGuard** from the App Store.
4. Open **SideStore** → it will ask for the pairing file → select it from Files.
5. SideStore will prompt to set up the WireGuard tunnel ("SideStore" VPN profile) → allow it.
6. In SideStore → Settings → sign in with your Apple ID. Enable **background refresh** so the 7-day re-sign happens automatically.

## Part 3 — Installing Toreka (every build)

1. On the iPhone, open **https://github.com/Xerityx/toreka/releases** in Safari and download `Toreka.ipa` from the latest release.
2. Open **SideStore** → **My Apps** → **+** → choose the downloaded `Toreka.ipa` from Files.
3. Wait ~30 seconds. Toreka appears on your home screen. Done.

Updates: download the new `.ipa` and repeat — SideStore installs over the top, **your collection data is preserved** (it lives in the app's documents folder, untouched by reinstalls).

## Gotchas

- **3-app limit** (free Apple ID): SideStore + Toreka + one more. Fine for our use.
- **7-day expiry**: if the iPhone is off/no-wifi for a week and the app "expires," open SideStore and tap Refresh — nothing is lost.
- **After an iOS update**, the WireGuard tunnel sometimes needs toggling off/on in Settings → VPN.
- If SideStore refresh fails repeatedly, re-run Part 2 step 1 to generate a fresh pairing file (pairing breaks if you change iPhone passcode settings).
