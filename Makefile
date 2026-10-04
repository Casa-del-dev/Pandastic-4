ANDROID_DIR := android
.DEFAULT_GOAL := run
PACKAGE_NAME ?= org.pandastic.relay

# Prefer an explicitly provided SDK path, then the project's local.properties.
ifeq ($(strip $(SDK_DIR)),)
SDK_DIR := $(or $(strip $(ANDROID_HOME)),$(strip $(ANDROID_SDK_ROOT)),$(shell sed -n 's/^sdk.dir=//p' $(ANDROID_DIR)/local.properties 2>/dev/null),$(HOME)/Android/Sdk)
endif
ifeq ($(strip $(ADB)),)
ADB := $(if $(wildcard $(SDK_DIR)/platform-tools/adb),$(SDK_DIR)/platform-tools/adb,adb)
endif
ifeq ($(strip $(EMULATOR)),)
EMULATOR := $(if $(wildcard $(SDK_DIR)/emulator/emulator),$(SDK_DIR)/emulator/emulator,emulator)
endif
EMULATOR_NAME ?=
BOOT_TIMEOUT ?= 180
EMULATOR_LOG ?= /tmp/pandastic-emulator.log
DEVICE ?=
APK := $(ANDROID_DIR)/app/build/outputs/apk/debug/app-debug.apk
BUILD_APK = (cd "$(ANDROID_DIR)" && ./gradlew assembleDebug)
EMULATOR_TARGET = $(if $(DEVICE),-s "$(DEVICE)",-e)
PHONE_TARGET = $(if $(DEVICE),-s "$(DEVICE)",-d)
EMULATOR_OPTIONS = --adb "$(ADB)" --emulator "$(EMULATOR)" --sdk "$(SDK_DIR)" --name "$(EMULATOR_NAME)" --device "$(DEVICE)" --timeout "$(BOOT_TIMEOUT)" --log "$(EMULATOR_LOG)"

.PHONY: run run-device build release web stop

# Gradle also builds React and bundles it into the APK.
build:
	@$(BUILD_APK)

# Side-loadable phone APK (arm64 only, release-optimised). The 533 MB LLM is copied separately (docs/DEMO.md).
release:
	@cd $(ANDROID_DIR) && ./gradlew -PphoneOnly assembleRelease
	@ls -lh $(ANDROID_DIR)/app/build/outputs/apk/release/app-release.apk

# Quick UI development in the computer's browser.
web:
	@cd frontend && $(if $(shell command -v corepack 2>/dev/null),corepack pnpm,pnpm) run dev

# Run on an emulator. Reuse an existing emulator when possible.
run:
	@set -eu; \
	serial=$$(bash scripts/android-emulator.sh start $(EMULATOR_OPTIONS)); \
	$(BUILD_APK); \
	"$(ADB)" -s "$$serial" install -r "$(APK)"; \
	"$(ADB)" -s "$$serial" shell am start -W -S -n "$(PACKAGE_NAME)/.FrontendActivity"

# Run on one USB-connected Samsung/Android phone. DEVICE selects a specific serial.
run-device:
	@command -v "$(ADB)" >/dev/null 2>&1 || { echo "adb not found. Add Android SDK platform-tools to PATH." >&2; exit 1; }
	@"$(ADB)" $(PHONE_TARGET) get-state >/dev/null 2>&1 || { echo "No single authorized phone found. Enable USB debugging, accept the phone's USB prompt, and check adb devices. With multiple phones use make run-device DEVICE=YOUR_SERIAL." >&2; exit 1; }
	@$(BUILD_APK)
	@"$(ADB)" $(PHONE_TARGET) install -r "$(APK)"
	@"$(ADB)" $(PHONE_TARGET) shell am start -S -n "$(PACKAGE_NAME)/.FrontendActivity"

stop:
	@bash scripts/android-emulator.sh stop $(EMULATOR_OPTIONS)
