ANDROID_DIR := android
EMULATOR_NAME ?= Medium_Phone_API_37.0
PACKAGE_NAME := org.pandastic.relay

.PHONY: run stop

run:
	@command -v emulator >/dev/null 2>&1 || { echo "Android emulator not found. Add the Android SDK emulator directory to PATH." >&2; exit 1; }
	@command -v adb >/dev/null 2>&1 || { echo "adb not found. Add the Android SDK platform-tools directory to PATH." >&2; exit 1; }
	@echo "Starting emulator $(EMULATOR_NAME)..."
	@emulator @$(EMULATOR_NAME) >/dev/null 2>&1 &
	@echo "Waiting for emulator to boot..."
	@adb wait-for-device
	@until [ "$$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 1; done
	@echo "Building and installing debug app..."
	@cd $(ANDROID_DIR) && ./gradlew installDebug
	@echo "Launching $(PACKAGE_NAME)..."
	@adb shell monkey -p $(PACKAGE_NAME) 1

stop:
	@command -v adb >/dev/null 2>&1 || { echo "adb not found. Add the Android SDK platform-tools directory to PATH." >&2; exit 1; }
	@serial="$$(adb devices | awk 'NR > 1 && $$2 == "device" { print $$1; exit }')"; \
	if [ -z "$$serial" ]; then \
		echo "No running Android emulator found."; \
	else \
		echo "Stopping emulator $$serial..."; \
		adb -s "$$serial" emu kill; \
	fi
