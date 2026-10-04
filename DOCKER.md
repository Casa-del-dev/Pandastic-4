# Running Pandastic with Docker

You only need Docker (with Compose v2).

## 1. Two phones in the browser, with the real models

```sh
docker compose up --build
```

Open <http://localhost:8080>. It shows both phones side by side: the Basic
phone (Noor, number 5173) on the left and the Capable helper phone (5174) on
the right. Each phone also works on its own at <http://localhost:5173> and
<http://localhost:5174>.

On the Basic phone, send `P 1 12000` or a problem in your own words ("majani
ya kahawa yana unga wa njano chini"). The helper phone answers in the same
thread, the way its SMS hub does. On the helper phone, attach a leaf photo
with **+** to check it, or switch the target from SMS to the phone itself to
ask a question.

The answers come from the `brain` container. It runs the helper phone's own
Java code (`Brain`, `KeywordNlu`, `LlmNlu`, `ReplyWriter`, `HubPolicy`,
`LeafClassifier`, `QualityGate`), compiled unchanged from `android/` with
small stand-ins for the Android APIs (`desktop/`). It also loads:

- the fine-tuned Qwen3.5-0.8B (542 MB), through the same llama.cpp JNI code
  as the app, built for Linux. The build downloads it from the `models-v1`
  release and checks its size and SHA-256 against `ml/llm/model.json`.
- the EfficientNet-B0 leaf model and `knowledge.sqlite` from the APK's assets.

In the demo the helper answers every SMS from Noor: a message that is not
about farming ("hello") gets the menu. The app itself leaves personal messages
and plain greetings unanswered (`HubPolicy`); set `PANDASTIC_HUB_ANSWER_ALL: "0"`
in `docker-compose.yml` for that behaviour. The app answers one contact at most about 12 times
an hour, to save airtime; the demo raises that to 1000
(`PANDASTIC_HUB_HOURLY_LIMIT`). Above the limit, the SMS is not answered and
shows in the helper's chat. Answered SMS stay out of the
helper's chat (they are in its helper log in Settings). Dictation (Whisper) only runs in the Android app; in the
browser the microphone uses the browser's own speech service.

The leaf photo path follows the app (640 px JPEG, bilinear resize to 224 px
without antialiasing), but it is not bit-identical to Android. On the
human-test photos it gives the same answers as the emulator. Judge new leaf
models on an emulator (`scripts/photo-eval.mjs`).

Chats are kept in the `phone-state` volume; `docker compose down -v` resets
both phones. Keep the phones' host ports the same as their container ports
(`5173:5173`), because a phone's number is its port. Open the page as
`localhost`, not by the machine's IP address: the phones only accept requests
from localhost. The brain uses about 800 MB of memory; on x86_64 it needs a
CPU with AVX2 (Intel 2013+, AMD 2015+).

## Deploy the phone pair on a server

Any Linux server or cloud VM works if it has Docker, 2 GB of RAM, 5 GB of disk
and an x86_64 CPU with AVX2 (any current cloud VM). Open TCP ports **8080,
5173 and 5174** in its firewall, then on the server run:

```sh
git clone <this repo> && cd Pandastic-4
PANDASTIC_PUBLIC_HOST=<server IP or domain> docker compose up -d --build
```

Open `http://<server IP or domain>:8080`. `PANDASTIC_PUBLIC_HOST` must match
the address in the browser exactly: the phones refuse requests from any other
origin.

- Everyone who opens the page shares the same two phones and chats. Reset
  them with `docker compose down -v && PANDASTIC_PUBLIC_HOST=... docker compose up -d`.
- It is plain HTTP. Browsers only allow the microphone (dictation) on HTTPS
  or localhost; typing, SMS and photos from the gallery work.
- The phones run the Vite development server. That is fine for a demo, but
  don't put anything private on it.

## 2. Build the Android APK

```sh
docker build --target apk --output out .
```

`out/app-debug.apk` works on arm64 phones and x86_64 emulators. Install it
with `adb install -r out/app-debug.apk`. The image pins the toolchain from
`README.md`: SDK 35, NDK 28.2.13676358, CMake 3.22.1, JDK 17 and Node 24. The
first build downloads the SDK, NDK, llama.cpp, whisper.cpp and the 32 MB
Whisper model. It took under 3 minutes on a fast connection and a many-core
laptop; expect longer on a slower machine. Gradle and pnpm caches are kept
between builds.

This APK is signed with the container's own debug key. If a copy built on your
machine is already installed, `adb install -r` fails with a signature
mismatch. Run `adb uninstall org.pandastic.relay` first. That also deletes the
app's data, including an imported Qwen model.

For the phone-only release build (arm64, smaller):

```sh
docker build --target apk --build-arg GRADLE_ARGS="-PphoneOnly assembleRelease" --output out .
```

The Qwen language model is not in the APK. Download it in the app (Models
page), or side-load it as described in `docs/DEMO.md`.

## Not in Docker

The two-emulator SMS lab (`./run.sh`) needs the Android emulator with KVM and
a display. Run it on the host as described in `README.md`.
