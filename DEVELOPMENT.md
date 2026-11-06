# Android Live Reload

The Android platform and Ionic CLI are configured for on-device development.

## Requirements

- Android Studio and Android SDK installed.
- An Android phone with Developer options and USB debugging enabled, connected
  by USB and authorized for debugging.

## Run

From the project directory, run:

```sh
npm run android:live
```

This starts the development server on the computer, forwards its port over ADB,
then builds and installs the Android app. The app uses
`http://localhost:8100` through the USB tunnel. Using localhost keeps Web Crypto
available for first-access password setup. Leave the terminal running; edits
to files under `src` reload the app on the phone.

If multiple Android devices are connected, set `ANDROID_DEVICE_ID` to the
desired ADB serial before running the command.

Stop the session with `Ctrl+C`. The local Android SDK path is stored in the
git-ignored `android/local.properties`; update it if the SDK is installed
elsewhere.

The app uses SQLite on Android. Live Reload serves updated web code but does
not clear the app's on-device database. Native Java/Kotlin changes still need a
new Android build.
