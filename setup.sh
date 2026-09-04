#!/bin/bash

##############################################################################
# Simple Fitness App - One-Time Setup Script
# Run this script ONCE to install all prerequisites for Android builds
##############################################################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
# Setup Functions
##############################################################################

install_java17() {
    print_step "Installing Java 17..."
    
    if command -v java &> /dev/null; then
        JAVA_VERSION=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d'.' -f1)
        if [ "$JAVA_VERSION" = "17" ]; then
            print_success "Java 17 already installed"
            return
        fi
    fi
    
    sudo apt update
    sudo apt install -y openjdk-17-jdk openjdk-17-jre
    
    # Set as default
    sudo update-alternatives --set java /usr/lib/jvm/java-17-openjdk-amd64/bin/java || true
    sudo update-alternatives --set javac /usr/lib/jvm/java-17-openjdk-amd64/bin/javac || true
    
    print_success "Java 17 installed"
}

configure_java_home() {
    print_step "Configuring JAVA_HOME..."
    
    JAVA_HOME_PATH="/usr/lib/jvm/java-17-openjdk-amd64"
    
    if ! grep -q "JAVA_HOME" ~/.bashrc; then
        echo "" >> ~/.bashrc
        echo "# Java Configuration" >> ~/.bashrc
        echo "export JAVA_HOME=$JAVA_HOME_PATH" >> ~/.bashrc
        echo "export PATH=\$JAVA_HOME/bin:\$PATH" >> ~/.bashrc
    fi
    
    export JAVA_HOME="$JAVA_HOME_PATH"
    export PATH="$JAVA_HOME/bin:$PATH"
    
    print_success "JAVA_HOME configured: $JAVA_HOME"
}

install_android_sdk() {
    print_step "Installing Android SDK..."
    
    ANDROID_SDK_ROOT="$HOME/Android/Sdk"
    
    if [ -d "$ANDROID_SDK_ROOT/cmdline-tools" ]; then
        print_success "Android SDK already installed"
        return
    fi
    
    # Create SDK directory
    mkdir -p "$ANDROID_SDK_ROOT"
    cd "$ANDROID_SDK_ROOT"
    
    # Download command line tools
    print_step "Downloading Android command line tools..."
    wget -q --show-progress https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
    
    # Extract
    unzip -q commandlinetools-linux-11076708_latest.zip
    
    # Move to proper location
    mkdir -p cmdline-tools/latest
    mv cmdline-tools/* cmdline-tools/latest/ 2>/dev/null || true
    
    # Clean up
    rm commandlinetools-linux-11076708_latest.zip
    
    print_success "Android SDK command line tools installed"
}

configure_android_home() {
    print_step "Configuring ANDROID_HOME..."
    
    ANDROID_SDK_ROOT="$HOME/Android/Sdk"
    
    if ! grep -q "ANDROID_HOME" ~/.bashrc; then
        echo "" >> ~/.bashrc
        echo "# Android Configuration" >> ~/.bashrc
        echo "export ANDROID_HOME=\$HOME/Android/Sdk" >> ~/.bashrc
        echo "export PATH=\$PATH:\$ANDROID_HOME/cmdline-tools/latest/bin" >> ~/.bashrc
        echo "export PATH=\$PATH:\$ANDROID_HOME/platform-tools" >> ~/.bashrc
        echo "export PATH=\$PATH:\$ANDROID_HOME/emulator" >> ~/.bashrc
    fi
    
    export ANDROID_HOME="$ANDROID_SDK_ROOT"
    export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin"
    export PATH="$PATH:$ANDROID_HOME/platform-tools"
    
    print_success "ANDROID_HOME configured: $ANDROID_HOME"
}

install_android_packages() {
    print_step "Installing Android SDK packages..."
    
    export ANDROID_HOME="$HOME/Android/Sdk"
    export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin"
    
    # Accept licenses
    yes | sdkmanager --licenses > /dev/null 2>&1
    
    # Install required packages
    sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" > /dev/null 2>&1
    
    print_success "Android SDK packages installed"
}

install_adb() {
    print_step "Installing ADB (Android Debug Bridge)..."
    
    if command -v adb &> /dev/null; then
        print_success "ADB already installed"
        return
    fi
    
    sudo apt install -y android-tools-adb android-tools-fastboot
    
    print_success "ADB installed"
}

verify_nodejs() {
    print_step "Verifying Node.js installation..."
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_success "Node.js $NODE_VERSION found"
    else
        print_warning "Node.js not found. Installing..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt install -y nodejs
        print_success "Node.js installed"
    fi
    
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        print_success "npm $NPM_VERSION found"
    fi
}

install_expo_cli() {
    print_step "Installing Expo CLI globally..."
    
    if npm list -g expo-cli > /dev/null 2>&1; then
        print_success "Expo CLI already installed"
        return
    fi
    
    npm install -g expo-cli
    
    print_success "Expo CLI installed"
}

##############################################################################
# Verification
##############################################################################

verify_setup() {
    print_step "Verifying installation..."
    
    echo ""
    echo "Java:"
    java -version 2>&1 | head -n 1
    echo ""
    
    echo "JAVA_HOME:"
    echo "$JAVA_HOME"
    echo ""
    
    echo "Android SDK:"
    echo "$ANDROID_HOME"
    echo ""
    
    echo "Node.js:"
    node --version
    echo ""
    
    echo "npm:"
    npm --version
    echo ""
    
    if command -v adb &> /dev/null; then
        echo "ADB:"
        adb --version | head -n 1
        echo ""
    fi
    
    print_success "All prerequisites installed successfully!"
}

##############################################################################
# Main Setup Process
##############################################################################

main() {
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║     Simple Fitness App - One-Time Setup Script          ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo "This script will install:"
    echo "  - Java 17"
    echo "  - Android SDK & Build Tools"
    echo "  - ADB (Android Debug Bridge)"
    echo "  - Expo CLI"
    echo ""
    echo -e "${YELLOW}This will require sudo access for some installations.${NC}"
    echo ""
    read -p "Continue? (y/n) " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
    
    START_TIME=$(date +%s)
    
    # Run all setup steps
    install_java17
    configure_java_home
    verify_nodejs
    install_android_sdk
    configure_android_home
    install_android_packages
    install_adb
    install_expo_cli
    
    # Verify everything
    verify_setup
    
    END_TIME=$(date +%s)
    SETUP_TIME=$((END_TIME - START_TIME))
    
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              SETUP COMPLETED SUCCESSFULLY!               ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Setup Time:${NC} ${SETUP_TIME} seconds"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Reload your terminal for environment variables to take effect${NC}"
    echo ""
    echo "Run this command:"
    echo "  source ~/.bashrc"
    echo ""
    echo "Then you can run ./build.sh to build your APK!"
    echo ""
}

##############################################################################
# Error Handler
##############################################################################

trap 'echo -e "\n${RED}Setup failed!${NC} Check the errors above."; exit 1' ERR

##############################################################################
# Run
##############################################################################

main "$@"