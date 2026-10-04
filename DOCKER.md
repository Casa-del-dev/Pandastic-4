# Running Pandastic with Docker

You only need Docker (with Compose v2). The `Dockerfile` has two targets.

## 1. Browser phone pair (quickest demo)

```sh
docker compose up --build
```

Open <http://localhost:8080>. It shows both phones side by side: the Basic
phone (Noor, number 5173) on the left and the Capable helper phone (5174) on
the right. Each phone also works on its own at <http://localhost:5173> and
<http://localhost:5174>.

Send `P 1 12000` from the Basic phone. The helper answers in the same thread
from the bundled `knowledge.sqlite`. Chats are kept in the `phone-state` volume.
`docker compose down -v` resets both phones.

Keep the phones' host ports the same as their container ports (`5173:5173`),
because a phone's number is its port. Open the page as `localhost`, not by
the machine's IP address: the phones only accept requests from localhost. No models run in this mode: the leaf classifier,
Qwen and Whisper only run in the Android app.

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
