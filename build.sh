#!/bin/bash

##############################################################################
# Simple Fitness App - Android Build Script
# Run this script after every code change to build a signed APK
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

# Keystore configuration
KEYSTORE_FILE="$ANDROID_DIR/app/my-release-key.keystore"
KEYSTORE_PROPS="$ANDROID_DIR/keystore.properties"

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
# Prerequisites Check
##############################################################################

check_prerequisites() {
    print_step "Checking prerequisites..."
    
    local all_good=true
    
    # Check Java 17
    if command -v java &> /dev/null; then
        JAVA_VERSION=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d'.' -f1)
        if [ "$JAVA_VERSION" = "17" ]; then
            print_success "Java 17 found"
        else
            print_error "Java 17 required, but found Java $JAVA_VERSION"
            echo "  Install: sudo apt install openjdk-17-jdk -y"
            echo "  Set default: sudo update-alternatives --config java"
            all_good=false
        fi
    else
        print_error "Java not found"
        echo "  Install: sudo apt install openjdk-17-jdk -y"
        all_good=false
    fi
    
    # Check JAVA_HOME
    if [ -z "$JAVA_HOME" ]; then
        print_warning "JAVA_HOME not set, attempting to set it"
        export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
        if [ ! -d "$JAVA_HOME" ]; then
            print_error "Cannot find Java installation at $JAVA_HOME"
            all_good=false
        else
            print_success "JAVA_HOME set to $JAVA_HOME"
        fi
    else
        print_success "JAVA_HOME: $JAVA_HOME"
    fi
    
    # Check Android SDK
    if [ -z "$ANDROID_HOME" ]; then
        print_warning "ANDROID_HOME not set, attempting to set it"
        export ANDROID_HOME="$HOME/Android/Sdk"
        if [ ! -d "$ANDROID_HOME" ]; then
            print_error "Android SDK not found at $ANDROID_HOME"
            echo "  Install Android SDK first (see setup guide)"
            all_good=false
        else
            print_success "ANDROID_HOME set to $ANDROID_HOME"
        fi
    else
        print_success "ANDROID_HOME: $ANDROID_HOME"
    fi
    
    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_success "Node.js $NODE_VERSION found"
    else
        print_error "Node.js not found"
        echo "  Install: sudo apt install nodejs npm -y"
        all_good=false
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        print_success "npm $NPM_VERSION found"
    else
        print_error "npm not found"
        all_good=false
    fi
    
    # Check keystore
    if [ ! -f "$KEYSTORE_FILE" ]; then
        print_warning "Keystore not found, will create it"
        create_keystore
    else
        print_success "Keystore found"
    fi
    
    # Check keystore.properties
    if [ ! -f "$KEYSTORE_PROPS" ]; then
        print_warning "keystore.properties not found, will create it"
        create_keystore_properties
    else
        print_success "keystore.properties found"
    fi
    
    if [ "$all_good" = false ]; then
        print_error "Prerequisites not met. Please fix the above issues."
        exit 1
    fi
    
    echo ""
}

##############################################################################
# First-time Setup Functions
##############################################################################

create_keystore() {
    print_step "Creating keystore..."
    
    mkdir -p "$ANDROID_DIR/app"
    
    # Generate keystore with default values for automated builds
    keytool -genkeypair -v -storetype PKCS12 \
        -keystore "$KEYSTORE_FILE" \
        -alias my-key-alias \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass android \
        -keypass android \
        -dname "CN=Simple Fitness, OU=Dev, O=Personal, L=City, S=State, C=US" \
        2>/dev/null
    
    if [ -f "$KEYSTORE_FILE" ]; then
        print_success "Keystore created successfully"
    else
        print_error "Failed to create keystore"
        exit 1
    fi
}

create_keystore_properties() {
    print_step "Creating keystore.properties..."
    
    cat > "$KEYSTORE_PROPS" << 'EOF'
storeFile=app/my-release-key.keystore
storePassword=android
keyAlias=my-key-alias
keyPassword=android
EOF
    
    if [ -f "$KEYSTORE_PROPS" ]; then
        print_success "keystore.properties created"
        
        # Add to .gitignore if not already there
        if [ -f "$ANDROID_DIR/.gitignore" ]; then
            if ! grep -q "keystore.properties" "$ANDROID_DIR/.gitignore"; then
                echo "keystore.properties" >> "$ANDROID_DIR/.gitignore"
                echo "*.keystore" >> "$ANDROID_DIR/.gitignore"
            fi
        fi
    else
        print_error "Failed to create keystore.properties"
        exit 1
    fi
}

configure_gradle_signing() {
    print_step "Configuring Gradle signing..."
    
    local BUILD_GRADLE="$ANDROID_DIR/app/build.gradle"
    
    # Check if signing is already configured
    if grep -q "keystorePropertiesFile" "$BUILD_GRADLE"; then
        print_success "Gradle signing already configured"
        return
    fi
    
    # Backup original
    cp "$BUILD_GRADLE" "$BUILD_GRADLE.backup"
    
    # Add keystore properties loading before android block
    if ! grep -q "def keystorePropertiesFile" "$BUILD_GRADLE"; then
        # Find the line with "apply plugin:" and insert after it
        sed -i '/apply plugin:/a\
\
def keystorePropertiesFile = rootProject.file("keystore.properties")\
def keystoreProperties = new Properties()\
if (keystorePropertiesFile.exists()) {\
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))\
}' "$BUILD_GRADLE"
    fi
    
    # Add signing config inside android block
    if ! grep -q "signingConfigs {" "$BUILD_GRADLE"; then
        sed -i '/android {/a\
\    signingConfigs {\
\        release {\
\            if (keystorePropertiesFile.exists()) {\
\                storeFile file(keystoreProperties["storeFile"])\
\                storePassword keystoreProperties["storePassword"]\
\                keyAlias keystoreProperties["keyAlias"]\
\                keyPassword keystoreProperties["keyPassword"]\
\            }\
\        }\
\    }' "$BUILD_GRADLE"
    fi
    
    # Update buildTypes to use signing config
    sed -i '/buildTypes {/,/release {/s/release {/release {\n            signingConfig signingConfigs.release/' "$BUILD_GRADLE"
    
    print_success "Gradle signing configured"
}

##############################################################################
# Build Functions
##############################################################################

clean_build() {
    print_step "Cleaning previous builds..."
    
    rm -rf "$ANDROID_DIR/app/build"
    rm -rf "$ANDROID_DIR/build"
    rm -rf "$PROJECT_ROOT/.expo"
    
    print_success "Clean complete"
}

install_dependencies() {
    print_step "Installing npm dependencies..."
    
    cd "$PROJECT_ROOT"
    npm install --silent
    
    print_success "Dependencies installed"
}

prebuild_android() {
    print_step "Running Expo prebuild..."
    
    cd "$PROJECT_ROOT"
    npx expo prebuild --platform android --clean > /dev/null 2>&1
    
    if [ -d "$ANDROID_DIR" ]; then
        print_success "Prebuild complete"
    else
        print_error "Prebuild failed"
        exit 1
    fi
}

build_apk() {
    print_step "Building release APK..."
    
    cd "$ANDROID_DIR"
    
    # Run Gradle build
    ./gradlew clean assembleRelease --quiet --no-daemon
    
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
        print_error "APK not found at $APK_OUTPUT"
        exit 1
    fi
}

install_to_device() {
    print_step "Checking for connected Android devices..."
    
    if command -v adb &> /dev/null; then
        # Check if device is connected
        DEVICES=$(adb devices | grep -v "List" | grep "device$" | wc -l)
        
        if [ "$DEVICES" -gt 0 ]; then
            echo -e "${YELLOW}Found connected device(s). Install APK now? (y/n)${NC}"
            read -r response
            if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
                adb install -r "$DESKTOP_APK"
                print_success "APK installed on device"
            fi
        else
            print_warning "No devices connected via ADB"
            echo "  Connect your phone and run: adb install $DESKTOP_APK"
        fi
    else
        print_warning "ADB not found. Install manually from Desktop"
    fi
}

##############################################################################
# Main Build Process
##############################################################################

main() {
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║         Simple Fitness App - Build Script               ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    START_TIME=$(date +%s)
    
    # Check all prerequisites
    check_prerequisites
    
    # Configure signing if needed (first time only)
    if [ ! -f "$KEYSTORE_PROPS" ] || ! grep -q "signingConfigs" "$ANDROID_DIR/app/build.gradle" 2>/dev/null; then
        configure_gradle_signing
    fi
    
    # Build process
    clean_build
    install_dependencies
    prebuild_android
    build_apk
    copy_apk
    
    # Calculate build time
    END_TIME=$(date +%s)
    BUILD_TIME=$((END_TIME - START_TIME))
    
    # Success message
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  BUILD SUCCESSFUL!                       ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Build Time:${NC} ${BUILD_TIME} seconds"
    echo -e "${BLUE}APK Location:${NC} $DESKTOP_APK"
    echo ""
    echo -e "${YELLOW}To install on your Pixel:${NC}"
    echo "  1. Copy SimpleFitness.apk from Desktop to your phone"
    echo "  2. Tap the APK file and install"
    echo ""
    echo "  Or use ADB: adb install $DESKTOP_APK"
    echo ""
    
    # Optional: Install to device
    install_to_device
}

##############################################################################
# Error Handler
##############################################################################

trap 'echo -e "\n${RED}Build failed!${NC} Check the errors above."; exit 1' ERR

##############################################################################
# Run
##############################################################################

main "$@"