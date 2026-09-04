@echo off
REM Builds a SimpleFitness Android APK from a clean checkout.
REM For plain Windows cmd.exe. See build-apk.sh for Git Bash / WSL.
REM
REM Usage:
REM   build-apk.cmd              debug build (default)
REM   build-apk.cmd --release    release build (signed with the same
REM                              committed debug keystore - see
REM                              android\app\build.gradle)
REM   build-apk.cmd --install    also `adb install -r` onto a connected device
REM   build-apk.cmd --no-bump    skip the automatic versionCode bump
REM
REM Assumes Node.js, a JDK (17, matching Expo SDK 52 / RN 0.76), and the
REM Android SDK (ANDROID_HOME set, licenses accepted) are already installed.
REM This script verifies they're present and fails with a clear message
REM otherwise - it does NOT attempt to install them, since an unattended
REM toolchain install is a much less reliable thing to script than "tell the
REM user what's missing."

setlocal enabledelayedexpansion
cd /d "%~dp0"

set BUILD_VARIANT=debug
set DO_INSTALL=false
set DO_BUMP=true

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--release" set BUILD_VARIANT=release
if /i "%~1"=="--debug" set BUILD_VARIANT=debug
if /i "%~1"=="--install" set DO_INSTALL=true
if /i "%~1"=="--no-bump" set DO_BUMP=false
shift
goto parse_args
:args_done

echo === SimpleFitness APK build (%BUILD_VARIANT%) ===

REM --- 1. Toolchain checks ---
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Node.js not found on PATH.
  echo Install it from https://nodejs.org/, then re-run this script.
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: npm not found on PATH.
  echo npm ships with Node.js - reinstalling Node.js should fix this.
  exit /b 1
)

where java >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Java (JDK) not found on PATH.
  echo Install a JDK 17 (e.g. https://adoptium.net/temurin/releases/?version=17), set JAVA_HOME, and add it to PATH.
  exit /b 1
)

REM This project's Gradle wrapper (android\gradle\wrapper\gradle-wrapper.properties)
REM is pinned to Gradle 8.10.2, which does not support JDK versions newer than it
REM (e.g. JDK 24) - that would otherwise fail later with a confusing "unsupported
REM class file major version" Gradle error instead of a clear one here.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-java-version.ps1"
if errorlevel 1 exit /b 1

if "%ANDROID_HOME%"=="" if "%ANDROID_SDK_ROOT%"=="" (
  echo.
  echo ERROR: ANDROID_HOME / ANDROID_SDK_ROOT not set.
  echo Install the Android SDK ^(via Android Studio's SDK Manager, or the command-line tools^), then set ANDROID_HOME to its location and re-run this script.
  exit /b 1
)

if not exist "android\gradlew.bat" (
  echo.
  echo ERROR: android\gradlew.bat not found.
  echo This script must be run from the SimpleFitness repo root, with the android\ folder present.
  exit /b 1
)

echo Toolchain OK.

REM --- 2. Warn (non-blocking) on uncommitted changes ---
where git >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%i in ('git status --porcelain 2^>nul') do (
    echo.
    echo WARNING: there are uncommitted changes in the working tree.
    echo The APK built now will not exactly match what's committed/reviewed.
    echo.
    goto git_check_done
  )
)
:git_check_done

REM --- 3. Auto-bump versionCode (distinguishes iterative test builds once installed) ---
if /i "%DO_BUMP%"=="true" (
  powershell -NoProfile -Command ^
    "$f = 'android\app\build.gradle';" ^
    "$c = Get-Content $f -Raw;" ^
    "$m = [regex]::Match($c, 'versionCode\s+(\d+)');" ^
    "if ($m.Success) {" ^
    "  $old = [int]$m.Groups[1].Value;" ^
    "  $new = $old + 1;" ^
    "  $c2 = $c.Substring(0, $m.Index) + ('versionCode ' + $new) + $c.Substring($m.Index + $m.Length);" ^
    "  Set-Content -Path $f -Value $c2 -NoNewline;" ^
    "  Write-Host \"Bumped versionCode: $old -> $new (pass --no-bump to skip)\";" ^
    "} else {" ^
    "  Write-Host 'Could not find versionCode in android\app\build.gradle - skipping bump.';" ^
    "}"
)

REM --- 4. Download dependencies ---
echo.
echo --- Installing npm dependencies ---
call npm install
if errorlevel 1 exit /b 1

REM --- 5. Build the APK ---
echo.
echo --- Building (%BUILD_VARIANT%) ---
cd android
if /i "%BUILD_VARIANT%"=="release" (
  call gradlew.bat assembleRelease
) else (
  call gradlew.bat assembleDebug
)
if errorlevel 1 (
  cd /d "%~dp0"
  exit /b 1
)
cd /d "%~dp0"

REM --- 6. Copy the APK somewhere convenient ---
set SRC_APK=android\app\build\outputs\apk\%BUILD_VARIANT%\app-%BUILD_VARIANT%.apk
set DEST_APK=SimpleFitness-%BUILD_VARIANT%.apk

if not exist "%SRC_APK%" (
  echo.
  echo ERROR: Build finished but the expected APK wasn't found at %SRC_APK%.
  echo Check the Gradle output above for the actual output path.
  exit /b 1
)

copy /y "%SRC_APK%" "%DEST_APK%" >nul
echo.
echo === Build complete: %DEST_APK% ===

REM --- 7. Optional: install onto a connected device ---
if /i "%DO_INSTALL%"=="true" (
  where adb >nul 2>&1
  if errorlevel 1 (
    echo NOTE: --install was passed but adb is not on PATH - skipping install.
  ) else (
    set DEVICE_FOUND=false
    for /f "skip=1 tokens=1,2" %%a in ('adb devices') do (
      if "%%b"=="device" set DEVICE_FOUND=true
    )
    if "!DEVICE_FOUND!"=="true" (
      echo Installing onto connected device...
      adb install -r "%DEST_APK%"
    ) else (
      echo NOTE: --install was passed but no device/emulator is connected ^(adb devices^) - skipping install.
    )
  )
)

endlocal
