ANDROID_DIR := android
EMULATOR_NAME ?= Medium_Phone_API_37.0
PACKAGE_NAME ?= org.pandastic.relay
SDK_DIR ?= $(or $(ANDROID_HOME),$(ANDROID_SDK_ROOT),$(shell sed -n 's/^sdk.dir=//p' $(ANDROID_DIR)/local.properties 2>/dev/null),$(HOME)/Android/Sdk)
ADB ?= $(if $(wildcard $(SDK_DIR)/platform-tools/adb),$(SDK_DIR)/platform-tools/adb,adb)
EMULATOR ?= $(if $(wildcard $(SDK_DIR)/emulator/emulator),$(SDK_DIR)/emulator/emulator,emulator)
DEVICE ?=
APK := $(ANDROID_DIR)/app/build/outputs/apk/debug/app-debug.apk
EMULATOR_TARGET = $(if $(DEVICE),-s "$(DEVICE)",-e)
PHONE_TARGET = $(if $(DEVICE),-s "$(DEVICE)",-d)

.PHONY: run run-device build web stop

# Gradle also builds React and bundles it into the APK.
build:
	@cd $(ANDROID_DIR) && ./gradlew assembleDebug

# Quick UI development in the computer's browser.
web:
	@cd frontend && npm run dev

# Run on an emulator. Reuse an existing emulator when possible.
run:
	@command -v "$(ADB)" >/dev/null 2>&1 || { echo "adb not found. Add Android SDK platform-tools to PATH, or set ADB=/path/to/adb." >&2; exit 1; }
	@if ! "$(ADB)" $(EMULATOR_TARGET) get-state >/dev/null 2>&1; then \
		if [ -n "$(DEVICE)" ]; then echo "Device $(DEVICE) is unavailable. Check adb devices." >&2; exit 1; fi; \
		command -v "$(EMULATOR)" >/dev/null 2>&1 || { echo "Android emulator not found. Add it to PATH or set EMULATOR=/path/to/emulator." >&2; exit 1; }; \
		echo "Starting emulator $(EMULATOR_NAME). Startup log: /tmp/pandastic-emulator.log"; \
		ANDROID_HOME="$(SDK_DIR)" ANDROID_SDK_ROOT="$(SDK_DIR)" "$(EMULATOR)" -avd "$(EMULATOR_NAME)" > /tmp/pandastic-emulator.log 2>&1 & \
	fi
	@echo "Waiting for emulator (up to 180 seconds)..."
	@attempt=0; until [ "$$("$(ADB)" $(EMULATOR_TARGET) shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do \
		attempt=$$((attempt + 1)); \
		if [ "$$attempt" -ge 180 ]; then echo "Emulator did not boot. Check /tmp/pandastic-emulator.log and emulator -list-avds. Use make run EMULATOR_NAME=Your_AVD or DEVICE=emulator-5554 if needed." >&2; exit 1; fi; \
		sleep 1; \
	done
	@$(MAKE) build
	@"$(ADB)" $(EMULATOR_TARGET) install -r "$(APK)"
	@"$(ADB)" $(EMULATOR_TARGET) shell am start -S -n "$(PACKAGE_NAME)/.FrontendActivity"

# Run on one USB-connected Samsung/Android phone. DEVICE selects a specific serial.
run-device:
	@command -v "$(ADB)" >/dev/null 2>&1 || { echo "adb not found. Add Android SDK platform-tools to PATH." >&2; exit 1; }
	@"$(ADB)" $(PHONE_TARGET) get-state >/dev/null 2>&1 || { echo "No single authorized phone found. Enable USB debugging, accept the phone's USB prompt, and check adb devices. With multiple phones use make run-device DEVICE=YOUR_SERIAL." >&2; exit 1; }
	@$(MAKE) build
	@"$(ADB)" $(PHONE_TARGET) install -r "$(APK)"
	@"$(ADB)" $(PHONE_TARGET) shell am start -S -n "$(PACKAGE_NAME)/.FrontendActivity"

stop:
	@command -v "$(ADB)" >/dev/null 2>&1 || { echo "adb not found. Add Android SDK platform-tools to PATH." >&2; exit 1; }
	@"$(ADB)" $(EMULATOR_TARGET) get-state >/dev/null 2>&1 && "$(ADB)" $(EMULATOR_TARGET) emu kill || echo "No single running emulator found. With multiple emulators use make stop DEVICE=emulator-5554."
