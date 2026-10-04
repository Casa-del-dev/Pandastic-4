# Pandastic React frontend

A responsive React + TypeScript interface for the strong phone’s local AI companion. The Android APK launches this UI in a WebView, with the production React assets bundled in the APK. It needs no internet or development server during use.

## Run on Samsung / Android

From the repository root, enable USB debugging on your phone, connect it by USB, accept its authorization prompt, and run:

```sh
make run-device
```

Use `make run-device DEVICE=YOUR_SERIAL` if multiple phones are attached. For an emulator, use `make run`. Both commands build React, package it inside the APK, install the APK, and launch the React screen. `make build` only builds the APK.

React source stays in `frontend/`; Gradle automatically builds it and copies `dist/` into generated Android assets. Do not copy or move source files into `android/` manually. Node and Corepack must be available to Gradle, including when building from Android Studio. Corepack uses the pnpm version pinned in `package.json`; a global pnpm executable is not required. The first build may need internet to download the package manager and dependencies.

The native wrapper is `android/app/src/main/java/org/pandastic/relay/FrontendActivity.java`. It serves bundled files through Android's `WebViewAssetLoader`, handles image picking/camera capture and microphone permission, and blocks external web requests. Keep Android System WebView up to date before deployment; the React UI requires a modern WebView even though the APK's minimum Android version is 6.0.

## Run locally

Requires Node.js 20.19+ or 22.12+ with Corepack.

```sh
cd frontend
corepack pnpm install
corepack pnpm run dev
```

Open the address printed by Vite, normally `http://localhost:5173`. For a production build, run `corepack pnpm run build`; static output is written to `dist/`. Use `corepack pnpm run preview` to view that build.

Dependencies must be installed before working without internet. The UI bundles its code, uses system fonts and inline SVG artwork, and makes no cloud/API requests. The Vite dev server is a development tool; it is not the planned phone-line connection between phones.

## What works

- Responsive layout with Assistant, Activity, Local models, and Phone connections pages.
- Typed questions and a conversation view with clearly labeled demo replies.
- Picture selection with previews. In the Android APK, the camera action opens an installed camera app, falling back to the image picker if none is available.
- Voice-note recording and playback through `MediaRecorder`, with a 30-second limit. Microphone use requires permission and a secure browser context (HTTPS or localhost).
- One image or recording attachment per request, capped at 10 MB.
- Session history and new-conversation reset. Refreshing the page clears history. Object URLs and microphone tracks are released when no longer needed.
- Recording stops automatically when the app/page goes into the background. Android microphone use asks for permission; denying permission leaves text and picture inputs usable.

## Next integration

`src/assistant.ts` defines the request and response adapter. Replace its demo implementation with a bridge to the strong phone’s actual local model runtime. Native packaging and Android microphone/camera support are implemented, but model inference is still a demo. No browser speech recognition is used because its processing location cannot be assumed to be offline.

Model status is currently “not connected.” Call/SMS/MMS status is also unconnected; this frontend does not send carrier messages, receive cellular calls, or process call audio. Preserve the requirements in the root `TODO.md` when adding those features.

## Source map

- `src/App.tsx`: navigation, conversation, attachment handling, and voice recording.
- `src/assistant.ts`: the replaceable local model adapter.
- `src/Icons.tsx`: inline icons and panda artwork.
- `src/styles.css`: responsive styling, including reduced-motion behavior.
