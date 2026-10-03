# Starts the Android emulator (if not already running), builds and installs the debug app, and launches it.
# Usage: .\run-emulator.ps1 [-Avd Pixel35] [-ColdBoot] [-Logcat]
param(
    [string]$Avd = "",
    [switch]$ColdBoot,
    [switch]$Logcat
)

$ErrorActionPreference = "Stop"
$package = "org.pandastic.relay"
$androidDir = Join-Path $PSScriptRoot "android"

# Locate the SDK: ANDROID_HOME, ANDROID_SDK_ROOT, then the default install location.
$sdk = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk") |
    Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $sdk) { throw "Android SDK not found. Set ANDROID_HOME or install it to $env:LOCALAPPDATA\Android\Sdk." }
$env:ANDROID_HOME = $sdk
$adb = Join-Path $sdk "platform-tools\adb.exe"
$emulator = Join-Path $sdk "emulator\emulator.exe"
foreach ($tool in $adb, $emulator) { if (-not (Test-Path $tool)) { throw "Missing $tool. Install it with sdkmanager." } }

function Get-EmulatorSerial {
    & $adb devices | ForEach-Object { if ($_ -match '^(emulator-\d+)\s+device$') { $Matches[1] } } | Select-Object -First 1
}

# Start the emulator unless one is already running.
$serial = Get-EmulatorSerial
if ($serial) {
    Write-Host "Emulator already running: $serial"
} else {
    $avds = @(& $emulator -list-avds | Where-Object { $_ })
    if (-not $avds) { throw "No AVDs found. Create one with avdmanager (see README)." }
    if (-not $Avd) { $Avd = if ($avds -contains "Pixel35") { "Pixel35" } else { $avds[0] } }
    if ($avds -notcontains $Avd) { throw "AVD '$Avd' not found. Available: $($avds -join ', ')" }
    $emuArgs = @("-avd", $Avd, "-no-snapshot-save")
    if ($ColdBoot) { $emuArgs += "-no-snapshot-load" }
    Write-Host "Starting emulator $Avd..."
    Start-Process -FilePath $emulator -ArgumentList $emuArgs | Out-Null
    & $adb wait-for-device
    $deadline = (Get-Date).AddMinutes(5)
    do {
        Start-Sleep -Seconds 2
        $booted = "$(& $adb shell getprop sys.boot_completed 2>$null)".Trim() -eq "1"
    } until ($booted -or (Get-Date) -gt $deadline)
    if (-not $booted) { throw "Emulator did not finish booting within 5 minutes." }
    $serial = Get-EmulatorSerial
    Write-Host "Emulator booted: $serial"
}

# Build and install the debug APK.
Write-Host "Building and installing debug app..."
& (Join-Path $androidDir "gradlew.bat") -p $androidDir installDebug
if ($LASTEXITCODE -ne 0) { throw "Gradle build failed (exit $LASTEXITCODE)." }

# Wake the screen, clear any stray screen on top, then launch the app fresh.
& $adb -s $serial shell input keyevent KEYCODE_WAKEUP
& $adb -s $serial shell wm dismiss-keyguard
& $adb -s $serial shell input keyevent KEYCODE_HOME
& $adb -s $serial shell am force-stop $package
& $adb -s $serial shell am start -n "$package/.MainActivity" | Out-Null
Write-Host "Launched $package on $serial"

if ($Logcat) {
    Start-Sleep -Seconds 1
    $appPid = "$(& $adb -s $serial shell pidof -s $package)".Trim()
    if ($appPid) { & $adb -s $serial logcat -v color --pid=$appPid }
}
