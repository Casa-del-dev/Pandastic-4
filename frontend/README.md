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

## Two local browser phones (ports are phone numbers)

Use **Node 22.13+ or Node 24+** for this local lab (it reads the bundled knowledge database using Node's SQLite module). From the repository root, run the one-command launcher:

```sh
./run.sh --web
```

It installs frontend dependencies when missing, starts both phones, waits until they are ready, and opens their browser tabs. If both phones are already running, it opens the existing pair. `./run.sh --web --no-open` skips opening tabs. Ctrl+C shuts down a pair started by this launcher. You can run the underlying commands manually too:

```sh
cd frontend
corepack pnpm install --frozen-lockfile
corepack pnpm dev:pair          # npm run dev:pair also works with dependencies installed
```

Open both:

- **Basic phone:** <http://127.0.0.1:5173>, phone number **5173**.
- **Capable phone:** <http://127.0.0.1:5174>, phone number **5174**.

Setup is automatic: each has the other port as its SMS destination, and the capable phone allows 5173 and has automatic replies enabled. Send **`P 1 12000`** from 5173: it appears on 5174, which replies with the saved coffee reference of UGX 15,500/kg (August 2026), including the 23% gap. Both conversations update immediately. You can also send a manual reply from either phone. On the capable phone, switch the composer to **This phone** for the existing browser AI preview.

These are two separate Vite processes: each owns its state and delivers messages to the other over loopback HTTP. SSE pushes incoming messages into each open browser. The port is the simulated phone number; the transport stays on this computer and incurs no carrier charges. Replies use templates and the repository's SQLite price data. Native Qwen and the leaf classifier still run only in Android; local replies are explicitly labelled as demo replies.

**Settings → Receive & reply** on 5174 controls the helper, allowlist and reply language. Turning the helper off still permits manual messages. Basic mode disables automatic replies. Automatic replies cannot trigger another automatic reply; the helper answers at most 12 questions per allowed phone per hour. An unavailable peer produces a failed send and preserves the draft. An uncertain delivery is marked unknown; check the conversation before retrying.

Messages and settings persist separately in `frontend/.local-phones/` (gitignored), including across browser refreshes and process restarts. Use Settings to clear a phone's history. For a complete reset, stop the pair and remove that directory. **Ctrl+C stops both instances.** If a port is occupied, startup fails instead of silently changing the phone number. To use different numbers:

```sh
BASIC_PORT=6173 CAPABLE_PORT=6174 corepack pnpm dev:pair
corepack pnpm test:local        # real HTTP integration tests using two temporary processes
```

The local lab binds to `127.0.0.1`; open the loopback URLs on this computer. Ordinary `pnpm dev` remains a UI preview, and APK production builds contain no phone server.

## Dictate a message

Tap the **microphone** beside Send, allow microphone access, speak, and tap **Stop**. Recognized words are appended to the existing draft, up to the composer's 480-character limit. Review or edit them, then press Send yourself. Dictation never sends automatically. Both the SMS and **This phone** composers support it; the app language selects English (`en-US`) or Swahili (`sw-KE`).

Android uses the native `SpeechRecognizer` service and requests microphone permission on first use. The two-emulator launcher grants this permission automatically. It prefers offline recognition, but installed languages and the phone's speech provider determine availability; Swahili may need internet. Browser phones use `SpeechRecognition` / `webkitSpeechRecognition` when available. Speech providers may process audio online. Errors preserve your draft. Switching conversation, language, or screen cancels recognition and ignores late results.

On Android, incoming SMS and local answer bubbles also have a **Read aloud** button when an installed offline voice supports the selected language. Network-only or not-yet-downloaded voices are excluded: Google TTS may advertise Swahili before its voice data is installed. Install the desired voice in Android’s text-to-speech settings when missing. Tap again to stop. Reading stops when leaving the conversation. The launcher sets emulator media volume to 11/15 (`DEMO_VOLUME=8 ./run.sh` changes it); check your computer's sound output too.

## Two actual Android phones (default launcher)

From the repository root:

```sh
./run.sh
```

`./run.sh --android` does the same thing. This is the full Android app in two emulator windows, including native SQLite, the leaf classifier and the optional Qwen model.

The launcher checks the SDK and build prerequisites, starts the helper and Basic phone AVDs, waits for both to boot, builds the APK, installs it on both phones, configures their SMS roles and allowlist, restarts their activities so the UI reads the new roles, and runs the simulated carrier. A per-pair lock prevents duplicate relays when the launcher is run again. Type `P 1 12000` in the Basic phone's chat. Ctrl+C stops the carrier; the emulators stay open.

The helper uses your existing AVD; select it with `EMULATOR_NAME=Your_AVD ./run.sh --android` when several exist. The launcher creates `pandastic_basic` if needed, reusing the helper’s already-installed Android system image. It copies hardware configuration only: the Basic phone starts with its own fresh userdata, without copying the helper’s messages, accounts, models, SD card or snapshots. SDK command-line tools and an extra Android 35 system-image download are unnecessary. Existing Basic AVDs are reused; `BASIC_AVD=Your_Basic_AVD` selects another. It does not download SDK images: install the Android prerequisites from the root README first. It installs Qwen on the capable phone automatically: a recognized local fine-tuned GGUF under `ml/artifacts` is preferred, otherwise it downloads the base Qwen3.5-0.8B Q4_K_M (533 MB) and verifies its published SHA-256. Weights remain gitignored and outside the APK. Existing phone model files are reused. `SKIP_QWEN=1 ./run.sh` skips model installation, or `QWEN_MODEL=/path/to/Qwen3.5-0.8B-pandastic-Q4_K_M.gguf ./run.sh` selects a local model. Keyword answers and the bundled classifier work without Qwen. Existing imported models and message histories are preserved; setup updates phone modes, destinations and the helper allowlist. `./run.sh --help` lists the options.

The language model runs through the native **llama.cpp** runtime; llama.cpp does not install weights. Qwen extracts intent and slots for the existing knowledge/price resolver, rather than generating free-form advice. The leaf classifier and SQLite knowledge also connect through `PandasticNative`; **Models** reports their actual loaded status and language model filename. To install weights separately: `node scripts/install-qwen.mjs --device emulator-5554`, then tap **Models → Load models** or restart the app.

## Choose phone numbers from Contacts

On Android, **Settings** reads saved phone contacts after Android grants Contacts access. Search a name or number and tap it to save the SMS destination immediately. In **Automatic replies → Add a phone**, choosing a contact fills its name and number; tap **Add** to allow it. Existing allowed contacts and this phone’s own number are excluded from suggestions. Denied or unavailable Contacts access leaves manual entry available. Contacts remain on the phone.

The phone’s own number appears automatically at the top of Settings. Real phones use the default SMS SIM’s number, with the legacy telephony API as fallback. Some SIMs/carriers do not expose a number; in that case **Your phone** still offers manual entry. Android may ask for Phone access once. The debug emulator pair uses its carrier-assigned lab numbers (+256772000001 / +256772000002); the lab also adds the opposite phone as a genuine local Contacts entry and avoids duplicate entries on rerun. Release builds and physical phones ignore the lab identity file. `node scripts/contacts-e2e.mjs` tests native Contacts → bridge → Settings suggestions on both configured emulator phones without sending SMS.
