# Pandastic Relay

A native Android APK skeleton for two phones communicating over local Wi-Fi or a phone hotspot, without internet during use. Install the **same APK** on both devices.

- **Small phone:** records up to 30 seconds of mono AAC audio, sends it to the stronger phone, and plays returned speech. No model runs here.
- **Strong phone:** runs a foreground HTTP server on port 8080 and generates a spoken response with an installed offline English Android TTS voice.
- **Current demo:** returns a fixed message acknowledging receipt. It does **not** recognize the user's speech or run an LLM/VLM. The pipeline interface is where those models will go.

This is push-to-talk with a reply after recording, rather than a telephone call or simultaneous conversation. Photos are not included in this skeleton.

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

## Build an APK

Open `android/` in Android Studio. Install Android SDK platform 35 and use JDK 17. Let Gradle sync, then build an APK. The first build requires internet to download development dependencies; running the app does not.

Command line, with the SDK location in `ANDROID_HOME` or `android/local.properties` (`sdk.dir=/your/android/sdk`):

```sh
cd android
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Minimum device OS: Android 6.0 (API 23). RAM alone does not establish compatibility: check the actual phone's Android version, microphone and ability to run its recording codec.

## Connect the phones

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
