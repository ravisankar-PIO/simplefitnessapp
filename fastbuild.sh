#!/bin/bash

##############################################################################
# Simple Fitness App - FAST Incremental Build Script
# Use this for quick rebuilds when you only changed a few files
# Falls back to full build if needed
##############################################################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project paths
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"
APK_OUTPUT="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
DESKTOP_APK="$HOME/Desktop/SimpleFitness.apk"

##############################################################################
# Helper Functions
##############################################################################

print_step() {
    echo -e "\n${BLUE}==>${NC} ${GREEN}$1${NC}"
}

print_error() {
    echo -e "${RED}ERROR: $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}WARNING: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

##############################################################################
# Build Functions
##############################################################################

quick_check() {
    print_step "Quick prerequisite check..."
    
    # Just verify essentials exist
    if [ ! -d "$ANDROID_DIR" ]; then
        print_error "Android folder missing. Run full build.sh first!"
        exit 1
    fi
    
    if [ -z "$JAVA_HOME" ]; then
        export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
    fi
    
    if [ -z "$ANDROID_HOME" ]; then
        export ANDROID_HOME="$HOME/Android/Sdk"
    fi
    
    print_success "Prerequisites OK"
}

install_dependencies() {
    print_step "Checking npm dependencies..."
    
    cd "$PROJECT_ROOT"
    
    # Only install if package.json changed or node_modules missing
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        print_step "Installing dependencies..."
        npm install --silent
        print_success "Dependencies updated"
    else
        print_success "Dependencies up to date (skipped)"
    fi
}

incremental_build() {
    print_step "Building APK (incremental)..."
    
    cd "$ANDROID_DIR"
    
    # Incremental build - NO clean, NO prebuild
    # This is MUCH faster for code changes
    ./gradlew assembleRelease --quiet --no-daemon
    
    if [ -f "$APK_OUTPUT" ]; then
        print_success "APK built successfully"
    else
        print_error "APK build failed"
        exit 1
    fi
}

copy_apk() {
    print_step "Copying APK to Desktop..."
    
    if [ -f "$APK_OUTPUT" ]; then
        cp "$APK_OUTPUT" "$DESKTOP_APK"
        
        # Get APK size
        APK_SIZE=$(du -h "$DESKTOP_APK" | cut -f1)
        
        print_success "APK copied to Desktop"
        echo "  Location: $DESKTOP_APK"
        echo "  Size: $APK_SIZE"
    else
        print_error "APK not found"
        exit 1
    fi
}

install_to_device() {
    if command -v adb &> /dev/null; then
        DEVICES=$(adb devices | grep -v "List" | grep "device$" | wc -l)
        
        if [ "$DEVICES" -gt 0 ]; then
            print_step "Installing on connected device..."
            adb install -r "$DESKTOP_APK" 2>/dev/null
            print_success "APK installed on device"
        fi
    fi
}

##############################################################################
# Main Build Process
##############################################################################

main() {
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║      Simple Fitness App - FAST Build Script             ║"
    echo "║      (Incremental - for quick iterations)                ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    START_TIME=$(date +%s)
    
    quick_check
    install_dependencies
    incremental_build
    copy_apk
    install_to_device
    
    END_TIME=$(date +%s)
    BUILD_TIME=$((END_TIME - START_TIME))
    
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  BUILD SUCCESSFUL!                       ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Build Time:${NC} ${BUILD_TIME} seconds (⚡ incremental)"
    echo -e "${BLUE}APK Location:${NC} $DESKTOP_APK"
    echo ""
    echo -e "${YELLOW}Note: If build fails or app behaves strangely, run ./build.sh for full rebuild${NC}"
    echo ""
}

##############################################################################
# Error Handler
##############################################################################

trap 'echo -e "\n${RED}Build failed!${NC} Try running ./build.sh for a full rebuild."; exit 1' ERR

##############################################################################
# Run
##############################################################################

main "$@"