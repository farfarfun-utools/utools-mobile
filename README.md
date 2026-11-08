# FunMobile

Android application with built-in FunOTP and FunLink views. The app reuses their backup formats and pure business logic; it does not install or run `.upxs` packages.

## First version

- OTP: TOTP, HOTP and Steam codes, add or edit an account, scan an `otpauth://` QR code with the camera/file picker, import and export FunOTP JSON backups.
- Bookmarks: search, filter by category, open HTTP(S) links, add or edit links, favorites, trash and restore, import and export FunLink JSON backups.
- Android data is stored with `@aparajita/capacitor-secure-storage` using AES-GCM, Android Keystore and SharedPreferences. Browser development mode uses `localStorage` and is not secure storage.

The Android app icon uses the shared farfarfun brand asset from `farfarfun/.github/brand`.

The phone app and desktop uTools plugins currently keep **separate local data**. Importing a backup replaces the phone's data for that module after confirmation. Exported backups are plaintext, especially OTP secrets. There is no automatic sync yet.

## Build

GitHub Actions runs tests, builds the web assets, syncs Capacitor and compiles a debug APK. Download `funmobile-debug-apk` from a successful workflow run. The APK is signed with the Android debug key and is for testing, not store distribution.

For development in an environment that permits local builds, use `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`, `pnpm android:sync`, then build the Android project with Gradle. This workspace runs builds and tests through GitHub Actions.

## Source

The desktop business modules are copied into `src/shared/` at the versions listed in [NOTICE.md](NOTICE.md). When either plugin changes its data format or OTP rules, update those modules and the compatibility test together.
