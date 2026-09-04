#!/usr/bin/env bash
# Builds a SimpleFitness Android APK from a clean checkout.
# For Git Bash / WSL on Windows. See build-apk.cmd for plain cmd.exe.
#
# Usage:
#   ./build-apk.sh              # debug build (default)
#   ./build-apk.sh --release    # release build (signed with the same
#                                # committed debug keystore - see
#                                # android/app/build.gradle)
#   ./build-apk.sh --install    # also `adb install -r` onto a connected device
#   ./build-apk.sh --no-bump    # skip the automatic versionCode bump
#
# Assumes Node.js, a JDK (17, matching Expo SDK 52 / RN 0.76), and the Android
# SDK (ANDROID_HOME set, licenses accepted) are already installed. This script
# verifies they're present and fails with a clear message otherwise - it does
# NOT attempt to install them, since an unattended toolchain install is a much
# less reliable thing to script than "tell the user what's missing."

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BUILD_VARIANT="debug"
DO_INSTALL=false
DO_BUMP=true

for arg in "$@"; do
  case "$arg" in
    --release) BUILD_VARIANT="release" ;;
    --debug) BUILD_VARIANT="debug" ;;
    --install) DO_INSTALL=true ;;
    --no-bump) DO_BUMP=false ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--release|--debug] [--install] [--no-bump]"
      exit 1
      ;;
  esac
done

echo "=== SimpleFitness APK build ($BUILD_VARIANT) ==="

# --- 1. Toolchain checks ---
fail_missing() {
  echo ""
  echo "ERROR: $1"
  echo "$2"
  exit 1
}

command -v node >/dev/null 2>&1 || fail_missing \
  "Node.js not found on PATH." \
  "Install it from https://nodejs.org/ (or via nvm), then re-run this script."

command -v npm >/dev/null 2>&1 || fail_missing \
  "npm not found on PATH." \
  "npm ships with Node.js - reinstalling Node.js should fix this."

command -v java >/dev/null 2>&1 || fail_missing \
  "Java (JDK) not found on PATH." \
  "Install a JDK 17 (e.g. https://adoptium.net/temurin/releases/?version=17), set JAVA_HOME, and add it to PATH."

if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  fail_missing \
    "ANDROID_HOME / ANDROID_SDK_ROOT not set." \
    "Install the Android SDK (via Android Studio's SDK Manager, or the command-line tools), then set ANDROID_HOME to its location and re-run this script."
fi

if [ ! -f "android/gradlew" ]; then
  fail_missing \
    "android/gradlew not found." \
    "This script must be run from the SimpleFitness repo root, with the android/ folder present."
fi

echo "Toolchain OK: node=$(node --version), java=$(java -version 2>&1 | head -n1)"

# --- 2. Warn (non-blocking) on uncommitted changes ---
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [ -n "$(git status --porcelain)" ]; then
    echo ""
    echo "WARNING: there are uncommitted changes in the working tree."
    echo "The APK built now will not exactly match what's committed/reviewed."
    echo ""
  fi
fi

# --- 3. Auto-bump versionCode (distinguishes iterative test builds once installed) ---
if [ "$DO_BUMP" = true ]; then
  GRADLE_FILE="android/app/build.gradle"
  CURRENT_CODE=$(grep -m1 -oE 'versionCode [0-9]+' "$GRADLE_FILE" | grep -oE '[0-9]+')
  if [ -n "$CURRENT_CODE" ]; then
    NEW_CODE=$((CURRENT_CODE + 1))
    # Only touch the defaultConfig's plain "versionCode N" line, not any other match.
    sed -i.bak -E "0,/versionCode [0-9]+/s//versionCode ${NEW_CODE}/" "$GRADLE_FILE"
    rm -f "${GRADLE_FILE}.bak"
    echo "Bumped versionCode: $CURRENT_CODE -> $NEW_CODE (pass --no-bump to skip)"
  else
    echo "Could not find versionCode in $GRADLE_FILE - skipping bump."
  fi
fi

# --- 4. Download dependencies ---
echo ""
echo "--- Installing npm dependencies ---"
npm install

# --- 5. Build the APK ---
echo ""
echo "--- Building ($BUILD_VARIANT) ---"
cd android
if [ "$BUILD_VARIANT" = "release" ]; then
  ./gradlew assembleRelease
else
  ./gradlew assembleDebug
fi
cd "$SCRIPT_DIR"

# --- 6. Copy the APK somewhere convenient ---
SRC_APK="android/app/build/outputs/apk/${BUILD_VARIANT}/app-${BUILD_VARIANT}.apk"
DEST_APK="SimpleFitness-${BUILD_VARIANT}.apk"

if [ ! -f "$SRC_APK" ]; then
  fail_missing "Build finished but the expected APK wasn't found at $SRC_APK." \
    "Check the Gradle output above for the actual output path."
fi

cp "$SRC_APK" "$DEST_APK"
echo ""
echo "=== Build complete: $DEST_APK ==="

# --- 7. Optional: install onto a connected device ---
if [ "$DO_INSTALL" = true ]; then
  if ! command -v adb >/dev/null 2>&1; then
    echo "NOTE: --install was passed but adb is not on PATH - skipping install."
  else
    DEVICE_COUNT=$(adb devices | grep -cE "device$")
    if [ "$DEVICE_COUNT" -lt 1 ]; then
      echo "NOTE: --install was passed but no device/emulator is connected (adb devices) - skipping install."
    else
      echo "Installing onto connected device..."
      adb install -r "$DEST_APK"
    fi
  fi
fi
