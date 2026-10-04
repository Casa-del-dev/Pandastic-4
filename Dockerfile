# syntax=docker/dockerfile:1.7
# Two targets (DOCKER.md):
#   web  browser phone pair (Basic 5173 + Capable 5174)     docker compose up
#   apk  debug APK built with the pinned Android toolchain  docker build --target apk --output out .

# ---------- web: the browser phone pair ----------
FROM node:24-bookworm-slim AS web
RUN corepack enable
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store CI=true corepack pnpm install --frozen-lockfile
COPY frontend/ ./
# The local phones answer from the same knowledge base as the app.
COPY android/app/src/main/assets/models/knowledge.sqlite /app/android/app/src/main/assets/models/knowledge.sqlite
ENV PANDASTIC_HOST=0.0.0.0 BASIC_PORT=5173 CAPABLE_PORT=5174 PANDASTIC_PHONE_STATE_DIR=/state
VOLUME /state
EXPOSE 5173 5174
CMD ["node", "local/run-pair.mjs"]

# ---------- android-build: SDK 35, NDK 28.2, CMake 3.22.1, JDK 17, Node 24 ----------
FROM eclipse-temurin:17-jdk-jammy AS android-build
RUN apt-get update && apt-get install -y --no-install-recommends git unzip ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=web /usr/local/bin/node /usr/local/bin/node
COPY --from=web /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/corepack
RUN ln -s ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack && corepack enable
ENV ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk
ARG CMDLINE_TOOLS=13114758
RUN curl -fsSL -o /tmp/tools.zip https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip \
    && mkdir -p $ANDROID_HOME/cmdline-tools && unzip -q /tmp/tools.zip -d $ANDROID_HOME/cmdline-tools \
    && mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest && rm /tmp/tools.zip \
    && yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses >/dev/null \
    && $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --install \
       "platform-tools" "platforms;android-35" "build-tools;35.0.0" "ndk;28.2.13676358" "cmake;3.22.1" >/dev/null
WORKDIR /src
COPY . .
# assembleDebug = arm64 + x86_64 (phones and emulators). GRADLE_ARGS="-PphoneOnly assembleRelease" for the phone-only build.
ARG GRADLE_ARGS=assembleDebug
RUN --mount=type=cache,target=/root/.gradle \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    cd android && ./gradlew --no-daemon $GRADLE_ARGS \
    && mkdir -p /out && find app/build/outputs/apk -name '*.apk' -exec cp {} /out/ \;

# ---------- apk: just the files, for --output ----------
FROM scratch AS apk
COPY --from=android-build /out/ /
