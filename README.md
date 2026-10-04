# Pandastic Relay

Pandastic is intended to let a person use a small, low-memory phone to reach AI models running locally on a more capable Android phone. The strong phone should also accept pictures directly (for example, from its camera or gallery) and let its user query its local models.

**A core requirement is that the two phones communicate over carrier phone service, such as a voice call or SMS/MMS, without internet access.** Local Wi-Fi or a hotspot does not meet the intended deployment constraint. The exact phone-line transport is still an open design question, especially how a normal call's audio can reach an app's local model on the strong phone.

The current APK launches a React interface bundled locally inside Android's WebView. It accepts text, pictures, and voice notes and shows demo responses. It does not yet run speech recognition, an LLM/VLM, image understanding, or carrier communication. Earlier Java code contains a local HTTP relay demo, but that screen is no longer the launcher. See [TODO.md](TODO.md) for the project context and next steps.

## Intended product

- **Strong phone:** runs models locally, accepts typed, spoken, and picture inputs, and returns text and/or spoken answers. It is also the server/AI host for requests from the small phone.
- **Small phone:** should be usable on a low-RAM device. It captures speech or a picture, sends the request over the supported phone-line channel, and presents the answer. Heavy models run on the strong phone.
- **Connectivity:** carrier voice/SMS/MMS only in the target location, with no internet. Carrier coverage is still required. Whether images can be sent this way depends on the chosen SMS/MMS or call-based design and carrier support.
- **Platform assumption:** Android is the current project platform. Confirm the actual phone models and Android versions before committing to telephony APIs or model runtimes.

## Current prototype

The React + TypeScript frontend lives in [`frontend/`](frontend/README.md). Android's Gradle build automatically builds it and bundles its static output into the APK. `FrontendActivity` loads it locally, handles image selection/camera capture and microphone permissions, and blocks external web requests. No React dev server is needed on the phone.

- React interface for text, picture attachments, voice-note recording/playback, and demo conversations.
- Java native wrapper and legacy relay/model scaffolding.
- No actual speech recognition, model inference, database retrieval, image understanding, cellular call integration, or SMS/MMS transport is implemented.

From the repository root:

```sh
make run-device  # Build, install and launch on a USB-connected Samsung/Android phone
make run         # Build, install and launch on an emulator
make build       # Build the APK without installing it
make web         # Preview React in the computer's browser (pnpm install first if needed)
```

For a physical phone, enable Developer options and USB debugging, connect by USB, and accept the authorization prompt. Check `adb devices` if the phone is not detected. With multiple phones, use `make run-device DEVICE=YOUR_SERIAL`.

## Folder structure

```text
frontend/                         # React source; also usable as a browser preview
├── src/
├── package.json / package-lock.json
└── vite.config.ts
android/
├── app/
│   ├── build.gradle
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── java/org/pandastic/relay/
│           ├── FrontendActivity.java # launcher: bundled React UI, camera and microphone
│           ├── MainActivity.java    # legacy relay screen, no longer the launcher
│           ├── RelayClient.java     # upload speech / download spoken reply
│           ├── RelayServer.java     # bounded local HTTP server
│           ├── SpeechPipeline.java  # replace demo with offline ASR + LLM
│           └── OfflineSpeaker.java  # offline text-to-speech synthesis
├── gradle/wrapper/
├── gradlew / gradlew.bat
├── settings.gradle
└── build.gradle
```

## Development setup (VS Code or command line)

Android Studio is optional. You can edit, build, and install this app from VS Code and a terminal. You need:

- **Node.js 20.19+ or 22.12+ and pnpm** to build the React assets. Ensure `node` and `pnpm` are on `PATH` for terminal and Android Studio builds.
- **JDK 17**. The Android Gradle Plugin is 8.9.2 and this project compiles Java 17. On Ubuntu/Debian, install it with `sudo apt install openjdk-17-jdk`; check with `java -version`.
- **Android SDK command-line tools**, including Android SDK **Platform 35** and **Build-Tools 35.0.0**. Install these with Android Studio's SDK Manager, or with Google's command-line tools and `sdkmanager`:

  ```sh
  sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
  sdkmanager --licenses
  ```

- **VS Code** (optional) and its **Extension Pack for Java** (optional, for Java editing and language support). Gradle itself is provided by the checked-in wrapper, so you do not need to install Gradle separately.
- **Android Platform-Tools** (`adb`) to install the APK on a phone. An emulator is optional; for one, also install Android Emulator and a system image, then create/start an AVD with `avdmanager` / `emulator`.
- **GNU Make** to use the optional root-level emulator shortcuts below. On Windows, use Make from WSL or install a Make-compatible environment.

### Point Gradle to the Android SDK

Set `ANDROID_HOME` to the SDK directory, or create `android/local.properties` containing its path. This file is machine-specific and ignored by Git. For example, on Linux with the SDK installed in the usual location:

```sh
cd android
printf 'sdk.dir=%s\n' "$HOME/Android/Sdk" > local.properties
```

The file should look like this (replace the path if your SDK is elsewhere):

```properties
sdk.dir=/home/YOUR_USERNAME/Android/Sdk
```

### Run on an emulator with Make

Create an Android Virtual Device (AVD) in Android Studio's Device Manager or with `avdmanager`. The Makefile defaults to an AVD named `Medium_Phone_API_37.0`; this is only a default name, and AVDs are local to each developer's machine. Start the app build, install and launch flow from the repository root with:

```sh
make run
```

If your AVD has a different name, pass it like this:

```sh
make run EMULATOR_NAME="Your AVD Name"
```

The Makefile locates SDK tools using `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `android/local.properties`, falling back to tools on `PATH`. You can override paths with `SDK_DIR=/path/to/sdk`, `ADB=/path/to/adb`, and `EMULATOR=/path/to/emulator`. It reuses an existing emulator and waits up to 180 seconds for boot. Failed startup logs are in `/tmp/pandastic-emulator.log`. With multiple emulators use `DEVICE=emulator-5554` to select one. Stop it with `make stop` (and the same `DEVICE` if needed).

On Windows, use forward slashes in the path, for example `sdk.dir=C:/Users/YOUR_USERNAME/AppData/Local/Android/Sdk`.

### Build and install

Open the repository folder in VS Code. In its integrated terminal, run:

```sh
cd android
./gradlew assembleDebug
```

On Windows, run `gradlew.bat assembleDebug`. The debug APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`. Gradle also runs `pnpm install --frozen-lockfile` and `pnpm run build` as needed and copies the React build into the APK. The first build needs internet to download Gradle, Android, and pnpm dependencies; running the app does not.

To install and launch on a USB-connected Android phone, enable Developer options and USB debugging, connect and authorize the phone, then run from `android/`:

```sh
adb devices
./gradlew installDebug
```

The app will appear on the phone as **Pandastic Relay**. You can also transfer the APK above to the phone and install it. To use an emulator, start an AVD first; `emulator -list-avds` lists configured emulators and `emulator -avd NAME` starts one.

If Gradle reports that the SDK location is missing, check that `android/local.properties` points to the SDK directory and that the directory contains `platforms/android-35`. If it warns that an SDK XML version is newer than the version it understands, update Android SDK Command-line Tools in SDK Manager, then retry.

Minimum device OS: Android 6.0 (API 23). The React UI also needs a modern Android System WebView; update it before deployment. RAM alone does not establish compatibility: check the actual phone's Android version, WebView, microphone and recording support.

## Legacy relay code (prototype only)

The earlier Java relay code uses Wi-Fi, not the intended phone-line deployment. It remains in the repository for reference; its `MainActivity` is no longer launched by `make run` and these controls are not part of the React screen.

1. While internet is still available, install an **offline English TTS voice** on the strong phone through its Android text-to-speech settings. Models are not downloaded by this app.
2. Create a hotspot on the strong phone and join it from the small phone, or connect both to the same Wi-Fi. Internet or mobile data is not needed. Some devices disable hotspots without mobile service; in that case use a local Wi-Fi router. Wi-Fi client isolation must be disabled.
3. On the strong phone, tap **Start server**. Keep the app visible. It displays candidate IP addresses and its pairing code. Use the Wi-Fi/hotspot address reachable from the other phone; hotspot settings may also show it.
4. On the small phone, enter `http://SERVER_IP:8080` and copy the strong phone's pairing code. Tap **Record**, grant microphone permission, speak, then tap **Stop and send**.
5. Listen for the fixed demo response. If disconnected, reconnect and tap **Send saved recording**. The current recording is kept in cache during this activity; there is no persistent request queue yet.

The client sends an authenticated `POST /speech` with an `audio/mp4` body and receives an `audio/wav` body. Maximum upload: 2 MB. One request runs at a time with one queued request; additional connections are closed. Connection timeout: 5 seconds; reply timeout: 60 seconds. Server starts/stops explicitly and stops when its Activity leaves the foreground. Rotation also stops it. The server keeps its screen awake while running.

## Add real speech intelligence

Implement `SpeechPipeline.respond(File recordedSpeech)` on the strong phone, then replace `new SpeechPipeline.Demo()` in `MainActivity`:

```text
AAC recording → decode/resample → offline ASR → transcript
            → retrieve local SQLite records → local LLM → response text
            → OfflineSpeaker → WAV → small phone playback
```

Keep ASR, model runtime and database access behind separate classes. Put native model bindings under `app/src/main/cpp/` if needed. Store downloaded/imported model files in the app's private files directory rather than committing them or bundling them into the APK. A real pipeline must add model initialization, cancellation, explicit deadlines and device memory benchmarks; the present interface is only a hook.

## Scope and limitations

- Local HTTP is unencrypted. The pairing code limits access but does not encrypt recordings. Use a trusted hotspot for the demo; production should add TLS and proper device pairing.
- No cloud endpoints, automatic discovery, background service, persistent queue, speech recognition, model inference, local knowledge database or carrier communication are included. Picture capture/selection is supported; AI image understanding is not.
- Offline speech output depends on the device's TTS engine and installed voice. The app selects a voice that reports it does not require a network connection and returns an error when none is available.
- Low memory compatibility, sound quality and carrier connectivity must be checked on the actual phones. The APK build and `make run` succeeded in the emulator. Bundled React loading, typed demo requests, and WebView microphone recording were checked with airplane mode enabled. A physical Samsung has not yet been tested.

Android references: [Load bundled content with WebViewAssetLoader](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content), [TTS API](https://developer.android.com/reference/android/speech/tts/TextToSpeech), [AGP 8.9 compatibility](https://developer.android.com/build/releases/agp-8-9-0-release-notes).
