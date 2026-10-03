ANDROID_DIR := android
EMULATOR_NAME ?= Medium_Phone_API_37.0
PACKAGE_NAME ?= org.pandastic.relay
ADB ?= adb
EMULATOR ?= emulator

.PHONY: run stop

run:
	@command -v "$(EMULATOR)" >/dev/null 2>&1 || { echo "Android emulator not found. Add the Android SDK emulator directory to PATH, or set EMULATOR=/path/to/emulator." >&2; exit 1; }
	@command -v "$(ADB)" >/dev/null 2>&1 || { echo "adb not found. Add Android SDK platform-tools to PATH, or set ADB=/path/to/adb." >&2; exit 1; }
	@echo "Starting emulator $(EMULATOR_NAME)..."
	@"$(EMULATOR)" -avd "$(EMULATOR_NAME)" >/dev/null 2>&1 &
	@echo "Waiting for emulator to boot..."
	@"$(ADB)" wait-for-device
	@until [ "$$("$(ADB)" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 1; done
	@echo "Building and installing debug app..."
	@cd $(ANDROID_DIR) && ./gradlew installDebug
	@echo "Launching $(PACKAGE_NAME)..."
	@"$(ADB)" shell monkey -p "$(PACKAGE_NAME)" 1

stop:
	@command -v "$(ADB)" >/dev/null 2>&1 || { echo "adb not found. Add Android SDK platform-tools to PATH, or set ADB=/path/to/adb." >&2; exit 1; }
	@serial="$$($(ADB) devices 2>/dev/null | awk 'NR > 1 && $$2 == "device" && $$1 ~ /^emulator-/ { print $$1; exit }')"; \
	if [ -z "$$serial" ]; then \
		echo "No running Android emulator found."; \
	else \
		echo "Stopping emulator $$serial..."; \
		"$(ADB)" -s "$$serial" emu kill; \
	fi
