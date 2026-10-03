# Pandastic Relay

Pandastic is intended to let a person use a small, low-memory phone to reach AI models running locally on a more capable Android phone. The strong phone should also accept pictures directly (for example, from its camera or gallery) and let its user query its local models.

**A core requirement is that the two phones communicate over carrier phone service, such as a voice call or SMS/MMS, without internet access.** Local Wi-Fi or a hotspot does not meet the intended deployment constraint. The exact phone-line transport is still an open design question, especially how a normal call's audio can reach an app's local model on the strong phone.

The current app is an early Android prototype whose small-phone-to-strong-phone transport uses local HTTP over Wi-Fi/hotspot. It is useful as a model and UI starting point, but it does not meet the phone-line requirement yet. Its response is fixed demo speech; it does not currently run speech recognition, an LLM/VLM, or image understanding. See [TODO.md](TODO.md) for the project context and next steps.

## Intended product

- **Strong phone:** runs models locally, accepts typed, spoken, and picture inputs, and returns text and/or spoken answers. It is also the server/AI host for requests from the small phone.
- **Small phone:** should be usable on a low-RAM device. It captures speech or a picture, sends the request over the supported phone-line channel, and presents the answer. Heavy models run on the strong phone.
- **Connectivity:** carrier voice/SMS/MMS only in the target location, with no internet. Carrier coverage is still required. Whether images can be sent this way depends on the chosen SMS/MMS or call-based design and carrier support.
- **Platform assumption:** Android is the current project platform. Confirm the actual phone models and Android versions before committing to telephony APIs or model runtimes.

## Current prototype

- Native Android app, implemented in Java.
- The strong phone runs a foreground HTTP server on port 8080 over local Wi-Fi/hotspot.
- The small phone records up to 30 seconds of mono AAC audio and sends it to that server.
- The strong phone returns a fixed demo reply using an installed offline English Android TTS voice.
- No actual speech recognition, model inference, database retrieval, image input, cellular call integration, or SMS/MMS transport is implemented.

## Folder structure

```text
android/
├── app/
│   ├── build.gradle
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── java/org/pandastic/relay/
│           ├── MainActivity.java    # role controls, recording and playback
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

The Makefile expects `adb` and `emulator` on `PATH`. If they are not, provide their locations with `ADB=/path/to/adb` and `EMULATOR=/path/to/emulator`. Stop the first running emulator with `make stop`. These targets use the debug build and do not alter Android SDK settings.

On Windows, use forward slashes in the path, for example `sdk.dir=C:/Users/YOUR_USERNAME/AppData/Local/Android/Sdk`.

### Build and install

Open the repository folder in VS Code. In its integrated terminal, run:

```sh
cd android
./gradlew assembleDebug
```

On Windows, run `gradlew.bat assembleDebug`. The debug APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`. The first build needs internet to download Gradle and Android dependencies; running the app does not.

To install and launch on a USB-connected Android phone, enable Developer options and USB debugging, connect and authorize the phone, then run from `android/`:

```sh
adb devices
./gradlew installDebug
```

The app will appear on the phone as **Pandastic Relay**. You can also transfer the APK above to the phone and install it. To use an emulator, start an AVD first; `emulator -list-avds` lists configured emulators and `emulator -avd NAME` starts one.

If Gradle reports that the SDK location is missing, check that `android/local.properties` points to the SDK directory and that the directory contains `platforms/android-35`. If it warns that an SDK XML version is newer than the version it understands, update Android SDK Command-line Tools in SDK Manager, then retry.

Minimum device OS: Android 6.0 (API 23). RAM alone does not establish compatibility: check the actual phone's Android version, microphone and ability to run its recording codec.

## Connect the phones (prototype only)

This section describes the current Wi-Fi demo, not the intended phone-line deployment.

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
- No cloud endpoints, automatic discovery, background service, persistent queue, speech recognition, model inference, local knowledge database or image support are included.
- Offline speech output depends on the device's TTS engine and installed voice. The app selects a voice that reports it does not require a network connection and returns an error when none is available.
- Low memory compatibility, sound quality and connectivity must be checked on the actual phones. No device testing or APK compilation has been completed in this workspace, which has no Java or Android SDK installed.

Android references: [TTS API](https://developer.android.com/reference/android/speech/tts/TextToSpeech), [AGP 8.9 compatibility](https://developer.android.com/build/releases/agp-8-9-0-release-notes).
