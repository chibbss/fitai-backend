#!/bin/bash

# Deep Link Testing Script for FitAI
# This script helps you test deep linking on iOS Simulator and Android Emulator

echo "🔗 FitAI Deep Link Tester"
echo "=========================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test URLs
CALLBACK_URL="fitai:///(auth)/callback#access_token=test_token&refresh_token=test_refresh&type=signup"
CHAT_URL="fitai:///chatscreen"
ONBOARDING_URL="fitai:///onboarding"

echo "Choose a platform to test:"
echo "1) iOS Simulator"
echo "2) Android Emulator"
echo "3) Both"
echo ""
read -p "Enter choice [1-3]: " choice

echo ""
echo "Choose a URL to test:"
echo "1) Auth Callback (Email Verification)"
echo "2) Chat Screen"
echo "3) Onboarding"
echo ""
read -p "Enter choice [1-3]: " url_choice

# Select URL
case $url_choice in
    1)
        TEST_URL=$CALLBACK_URL
        echo -e "${BLUE}Testing: Email Verification Callback${NC}"
        ;;
    2)
        TEST_URL=$CHAT_URL
        echo -e "${BLUE}Testing: Chat Screen${NC}"
        ;;
    3)
        TEST_URL=$ONBOARDING_URL
        echo -e "${BLUE}Testing: Onboarding${NC}"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""

# Test on selected platform
case $choice in
    1)
        echo -e "${GREEN}📱 Opening on iOS Simulator...${NC}"
        xcrun simctl openurl booted "$TEST_URL"
        ;;
    2)
        echo -e "${GREEN}🤖 Opening on Android Emulator...${NC}"
        adb shell am start -W -a android.intent.action.VIEW -d "$TEST_URL" com.eochi.fitai
        ;;
    3)
        echo -e "${GREEN}📱 Opening on iOS Simulator...${NC}"
        xcrun simctl openurl booted "$TEST_URL"
        echo ""
        echo -e "${GREEN}🤖 Opening on Android Emulator...${NC}"
        adb shell am start -W -a android.intent.action.VIEW -d "$TEST_URL" com.eochi.fitai
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo -e "${YELLOW}✅ Deep link command sent!${NC}"
echo ""
echo "What to check:"
echo "  • The app should open automatically"
echo "  • Check the console logs for 'Deep link received:'"
echo "  • Verify the correct screen is displayed"
echo ""
echo "Troubleshooting:"
echo "  • Make sure the app is installed (npx expo run:ios/android)"
echo "  • Check that you rebuilt after changing app.json"
echo "  • For Android, verify the package name matches: com.eochi.fitai"
echo ""



