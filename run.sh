#!/usr/bin/env bash
# One entrypoint for the browser phone pair or the native Android SMS lab.
set -euo pipefail
repo_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$repo_directory"
mode=web
open_browser=true
for option in "$@"; do
    case "$option" in
        --web) mode=web ;;
        --android) mode=android ;;
        --no-open) open_browser=false ;;
        -h|--help)
            cat <<'HELP'
Usage: ./run.sh [--web | --android] [--no-open]

  ./run.sh              Install missing dependencies and open both browser phones.
  ./run.sh --no-open    Start the browser phones without opening browser tabs.
  ./run.sh --android    Build the Android app, boot two emulators, configure SMS,
                        and keep the simulated carrier running.

Browser numbers default to 5173 and 5174 (BASIC_PORT / CAPABLE_PORT override).
Android uses an existing helper AVD and pandastic_basic (creates the latter when
its Android 35 system image is already installed). EMULATOR_NAME selects the helper.
Ctrl+C stops the browser pair or Android relay. Android emulators remain open.
Node 22.13+ is required for browser phones. Android also needs the SDK, JDK 17,
NDK and CMake described in README.md. Import Qwen separately in the Android app.
HELP
            exit 0 ;;
        *) printf 'Unknown option: %s. See ./run.sh --help.\n' "$option" >&2; exit 2 ;;
    esac
done
fail() { printf '%s\n' "$*" >&2; exit 1; }
command -v node >/dev/null || fail 'Node.js is missing. Install Node 24+, then run this script again.'

if [[ "$mode" == web ]]; then
    node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 13)) { console.error("Browser phones require Node 22.13+ or Node 24+."); process.exit(1) }'
    basic_port=${BASIC_PORT:-5173}
    capable_port=${CAPABLE_PORT:-5174}
    export BASIC_PORT="$basic_port" CAPABLE_PORT="$capable_port"
    node -e 'const ports = [process.env.BASIC_PORT, process.env.CAPABLE_PORT]; if (!ports.every(p => /^\d{4,5}$/.test(p) && +p >= 1024 && +p <= 65535) || ports[0] === ports[1]) { console.error("Choose two different ports between 1024 and 65535."); process.exit(1) }'

    open_phones() {
        printf '\nBasic phone:   http://127.0.0.1:%s\nCapable phone: http://127.0.0.1:%s\nSend P 1 12000 from the Basic phone.\n\n' "$basic_port" "$capable_port"
        if "$open_browser"; then
            if command -v xdg-open >/dev/null && [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
                xdg-open "http://127.0.0.1:$basic_port" >/dev/null 2>&1 &
                xdg-open "http://127.0.0.1:$capable_port" >/dev/null 2>&1 &
            elif command -v open >/dev/null; then
                open "http://127.0.0.1:$basic_port" "http://127.0.0.1:$capable_port" || true
            fi
        fi
    }
    # Re-running the launcher should reuse our existing pair, not collide with it.
    # JavaScript template literals must be passed unchanged to Node.
    # shellcheck disable=SC2016
    if node --input-type=module -e '
      try {
        const [basic, capable] = await Promise.all([process.env.BASIC_PORT, process.env.CAPABLE_PORT].map(async port => {
          const response = await fetch(`http://127.0.0.1:${port}/__phone/state`, { signal: AbortSignal.timeout(1000) });
          if (!response.ok) throw new Error("not a phone");
          const state = await response.json();
          if (state.number !== port) throw new Error("wrong phone");
          return state;
        }));
        if (basic.chat.peer !== capable.number || capable.chat.peer !== basic.number) throw new Error("different pair");
      } catch { process.exit(1) }'; then
        printf 'Both local phones are already running; reusing them.\n'
        open_phones
        exit 0
    fi

    if [[ ! -x frontend/node_modules/.bin/vite || ! -x frontend/node_modules/.bin/tsc ]]; then
        printf 'Installing frontend dependencies…\n'
        (
            cd frontend
            if command -v corepack >/dev/null; then
                corepack pnpm install --frozen-lockfile
            elif command -v pnpm >/dev/null; then
                pnpm install --frozen-lockfile
            elif command -v npm >/dev/null; then
                npm exec --yes --package=pnpm@10.13.1 -- pnpm install --frozen-lockfile
            else
                fail 'Install npm, Corepack or pnpm to install frontend dependencies.'
            fi
        )
    fi
    pair_pid=
    # Called by the EXIT trap, including when interrupted during startup.
    # shellcheck disable=SC2317
    cleanup() {
        if [[ -n "$pair_pid" ]]; then
            kill -TERM "$pair_pid" 2>/dev/null || true
            wait "$pair_pid" 2>/dev/null || true
        fi
    }
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    node frontend/local/run-pair.mjs &
    pair_pid=$!
    # Require both phones to answer before opening the tabs. Bound startup at 15 seconds.
    # shellcheck disable=SC2016
    PANDASTIC_LAUNCH_PID="$pair_pid" node --input-type=module -e '
      const ports = [process.env.BASIC_PORT, process.env.CAPABLE_PORT];
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        try { process.kill(Number(process.env.PANDASTIC_LAUNCH_PID), 0) }
        catch { console.error("The phone pair stopped during startup. See the error above."); process.exit(1) }
        try {
          await Promise.all(ports.map(async port => {
            const response = await fetch(`http://127.0.0.1:${port}/__phone/state`, { signal: AbortSignal.timeout(500) });
            if (!response.ok || (await response.json()).number !== port) throw new Error("not ready");
          }));
          process.exit(0);
        } catch { await new Promise(resolve => setTimeout(resolve, 250)) }
      }
      console.error("Phone startup failed. Check the errors above and whether the ports are occupied.");
      process.exit(1);'
    open_phones
    wait "$pair_pid"
    exit 0
fi

command -v make >/dev/null || fail 'make is required for Android. Install it and run ./run.sh --android again.'
sdk_directory=${SDK_DIR:-${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}}
if [[ -z "$sdk_directory" && -f android/local.properties ]]; then
    sdk_directory=$(sed -n 's/^sdk.dir=//p' android/local.properties | tr -d '\r')
fi
sdk_directory=${sdk_directory:-$HOME/Android/Sdk}
adb_command=${ADB:-$sdk_directory/platform-tools/adb}
emulator_command=${EMULATOR:-$sdk_directory/emulator/emulator}
command -v "$adb_command" >/dev/null || fail "adb is missing at $adb_command. Set SDK_DIR to your Android SDK."
command -v "$emulator_command" >/dev/null || fail "The emulator is missing at $emulator_command. Install it in Android Studio."
command -v java >/dev/null || fail 'JDK 17 is required to build the Android app.'
command -v timeout >/dev/null || fail 'GNU timeout is required for bounded emulator startup checks.'
if ! command -v corepack >/dev/null && ! command -v pnpm >/dev/null; then
    fail 'Android builds require Corepack or pnpm. Install pnpm@10.13.1, then rerun ./run.sh --android.'
fi
export ANDROID_HOME="$sdk_directory" ANDROID_SDK_ROOT="$sdk_directory" ADB="$adb_command"
avd_names=$("$emulator_command" -list-avds)
basic_avd=pandastic_basic
helper_avd=${EMULATOR_NAME:-}
if [[ -z "$helper_avd" ]]; then
    helper_names=()
    while IFS= read -r name; do
        name=${name//$'\r'/}
        [[ -z "$name" || "$name" == "$basic_avd" ]] || helper_names+=("$name")
    done <<< "$avd_names"
    [[ ${#helper_names[@]} -gt 0 ]] || fail 'Create a helper virtual device in Android Studio, then rerun ./run.sh --android.'
    [[ ${#helper_names[@]} -eq 1 ]] || fail "Multiple helper AVDs exist: ${helper_names[*]}. Run EMULATOR_NAME=Your_AVD ./run.sh --android."
    helper_avd=${helper_names[0]}
fi
[[ "$helper_avd" != "$basic_avd" ]] || fail 'The helper and Basic phone must use different AVDs.'
basic_exists=false
while IFS= read -r name; do [[ "${name//$'\r'/}" != "$basic_avd" ]] || basic_exists=true; done <<< "$avd_names"
if ! "$basic_exists"; then
    [[ -d "$sdk_directory/system-images/android-35/google_apis/x86_64" ]] || fail 'Install the Android 35 Google APIs x86_64 system image in Android Studio, then rerun this script.'
    avdmanager_command="$sdk_directory/cmdline-tools/latest/bin/avdmanager"
    if [[ ! -x "$avdmanager_command" ]]; then
        avdmanager_command=$(command -v avdmanager || true)
    fi
    [[ -n "$avdmanager_command" ]] || fail 'Install Android SDK Command-line Tools in Android Studio to create the Basic phone AVD.'
    printf 'Creating the Basic phone virtual device…\n'
    "$avdmanager_command" create avd -n "$basic_avd" -k 'system-images;android-35;google_apis;x86_64' -d small_phone <<< 'no'
fi

# Existing helper handles boot readiness, crash detection and timeouts for both devices.
printf 'Starting the Android helper phone…\n'
HUB=$(bash scripts/android-emulator.sh start --adb "$adb_command" --emulator "$emulator_command" --sdk "$sdk_directory" --name "$helper_avd" --timeout "${BOOT_TIMEOUT:-180}" --log /tmp/pandastic-helper.log)
printf 'Starting the Android Basic phone…\n'
BASIC=$(bash scripts/android-emulator.sh start --adb "$adb_command" --emulator "$emulator_command" --sdk "$sdk_directory" --name "$basic_avd" --timeout "${BOOT_TIMEOUT:-180}" --log /tmp/pandastic-basic.log)
export HUB BASIC
make build SDK_DIR="$sdk_directory"
node scripts/sms-lab.mjs setup --install
printf '\nBoth Android phones are ready. Send P 1 12000 in the Basic phone chat.\nCtrl+C stops the carrier; the emulators stay open.\n'
exec node scripts/sms-lab.mjs relay
