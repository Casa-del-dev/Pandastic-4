# Pandastic React frontend

React + TypeScript, bundled inside the Android APK and served by a local WebView. The installed app needs no internet or development server.

## Phone modes

On first launch, choose a mode. Change it later in **Settings → Your phone**. Android displays the phone’s total RAM; the choice remains manual because available memory and model size also affect suitability.

| Mode | Screens | Processing |
| --- | --- | --- |
| Basic phone | Chat, Settings | Sends and receives carrier SMS. No photo controls, model loading, or automatic AI responder. |
| Capable phone | Chat, Models, Settings | Carrier SMS plus questions to this phone’s models, camera/gallery checks, and an optional automatic SMS responder. |

The chat has no header or introductory text: only the panda in an empty conversation, a composer, and a small navigation row. Camera/gallery input lives in the composer and appears in the conversation. The Models page code loads only when opened in capable mode. There is no separate Photos or buyer-price page; price questions use chat. Switching to Basic phone disables the native responder and releases loaded models after any active inference finishes. The Android role preference also gates background startup and inference calls.

Basic mode reduces model work, but the APK still contains React, WebView, and native libraries. Performance on a 0.5 GB RAM phone has not been measured. A phone without compatible Android can use its normal SMS app to contact the capable phone.

## Run on Android

From the repository root:

```sh
make run            # emulator: build, install and open
make run-device     # USB-connected Android phone
make build          # build the APK without launching
make stop           # stop the emulator
```

Use `make run-device DEVICE=YOUR_SERIAL` when multiple phones are connected. Node and Corepack must be available to Gradle. Gradle runs the pinned pnpm version and packages the production frontend automatically; source stays in `frontend/`.

## Connect the two phones

1. On the stronger phone, select **Capable phone**.
2. In Settings, add the smaller phone under **Phones that can ask**. Turn on **Automatic SMS replies** and grant the requested SMS permissions. Allow background operation when Android asks.
3. On the smaller Android phone, select **Basic phone**. Save the stronger phone’s number under **SMS destination** and allow SMS.
4. Write a question in Chat and press Send. The reply appears in the same conversation. A basic phone without the app can send the same question using its regular SMS app.

Both phones need carrier service, working SIMs and SMS credit/coverage. Mobile data, internet and Wi-Fi are unnecessary. Carrier charges apply, including multipart messages. Dual-SIM phones use Android’s default SMS SIM; configure that in the phone’s system settings.

The app saves its own conversations, not the entire system SMS inbox. It records replies from the saved destination, existing app conversations, and allowed hub contacts. SMS access must be granted before incoming replies can be saved. Messages received before permission/setup are not imported. The newest 300 messages are stored locally; the UI loads the latest 150. Settings can clear app history without deleting messages from the system SMS app.

Outgoing statuses are **Sending**, **Sent** (all parts confirmed by the phone’s SMS send callback), **Not sent**, or **Submitted to carrier** (automatic hub reply; no delivery confirmation). Sent does not mean delivered. An unknown send result must be checked before retrying, to avoid duplicate charges.

## Questions and pictures on the capable phone

- **Chat → This phone:** typed questions use the existing native model/knowledge pipeline. Ask price questions here (for example, `coffee price 12000`). Local history lasts for the app session and keeps the newest 80 entries. Requests continue while Models or Settings is open.
- **Chat → + → Camera / Gallery:** attach a picture, optionally add a question, then send. A thumbnail and the model’s reply appear in the conversation. The attachment can be removed before sending. Images are capped at 20 MB, resized for the native bridge, and processed locally; they are not sent through SMS or MMS. Current classifier scope remains coffee leaves; uncertainty, source and escalation advice are preserved.
- **Automatic SMS replies:** opt in through Settings and add allowed numbers. Only capable mode can enable the service. Switching back to capable mode does not automatically re-enable it after Basic mode turned it off.

## Models

The capable phone has a **Models** page with the image classifier, optional language model and bundled knowledge base. It shows file sizes, whether each is installed/loaded, and whether the classifier is a preview. Opening the page reads metadata without loading the model weights.

- **Load models** explicitly prepares the local runtime. Models also load when needed for a chat request.
- **Release memory** turns off the SMS responder and unloads model resources after any active inference. Files remain installed; the next local request can load them again.
- **Import model file** opens Android’s file picker for `Qwen3.5-0.8B-Q4_K_M.gguf` (about 533 MB), already stored on the phone. The app streams it into private storage, checks the filename, GGUF header and size bounds (100 MB–1 GB), then replaces the previous private model atomically. Compatibility is confirmed only when the native runtime loads it; the importer does not verify a publisher checksum. Choose the project’s documented model. A failed/cancelled copy preserves the old model file. Cancelling the picker leaves the responder unchanged; a valid-file import turns it off before copying. Re-enable automatic replies in Settings afterwards if needed.

Imports need sufficient free storage for a temporary copy. There is no in-app download or model marketplace. The image model and knowledge base are bundled and cannot be replaced from this screen. Runtime/model operations are disabled in the browser preview.

Cellular call audio and speech-to-speech are not implemented.

## Browser preview

```sh
cd frontend
corepack pnpm install
corepack pnpm run dev
corepack pnpm run build
```

Open the Vite URL (normally `http://localhost:5173`). The browser supports mode selection and visual previews, with clearly marked sample model results. SMS sending is disabled because it needs the Android bridge. Phone mode, language and destination are stored locally. Browser conversations are not real carrier traffic.

Fonts, icons and code are bundled offline. No cloud APIs or browser speech recognition are used. The Vite server is only a development tool.

## Source map

- `src/App.tsx`: phone mode and navigation, with the chat kept mounted across screens.
- `src/Chat.tsx`: SMS/local chat, camera/gallery attachments and image replies.
- `src/Models.tsx`: model inventory and native load/release/import controls.
- `src/PhoneSetup.tsx` / `src/Settings.tsx`: mode choice, language, destination and responder setup.
- `src/answers.ts`: conversational formatting with price dates, sources and photo safety rules.
- `src/native.ts`: Android bridge, SMS contracts and browser preview adapters.
- `src/ux.ts` / `src/i18n.ts`: English/Swahili copy. Swahili still needs native-speaker review.
- `src/Icons.tsx` / `src/styles.css`: vector panda, icons and responsive styling.
- `android/.../FrontendActivity.java`: offline WebView, camera/gallery picker and permissions.
- `android/.../NativeBridge.java`: native mode enforcement, model calls and SMS actions.
- `android/.../hub/ChatStore.java`: bounded local SMS threads and outgoing carrier callbacks.
