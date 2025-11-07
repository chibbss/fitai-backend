# Deep Linking Setup Guide for FitAI Email Verification

## ✅ What Was Changed

I've configured your app for proper deep linking to handle email verification. Here's what was updated:

### 1. **app.json** - Deep Link Configuration
- Added `intentFilters` for Android to handle Supabase URLs
- Added `associatedDomains` for iOS (optional, for production)
- Configured the app to respond to:
  - `fitai://` custom scheme
  - `https://*.supabase.co/auth/v1/verify` URLs

### 2. **utils/supabase.ts** - Auth Configuration
- Created `getAuthRedirectUrl()` helper function
- Configured redirect URL: `fitai:///(auth)/callback`
- Added proper deep link listener with AppState monitoring
- Added session checking when app becomes active

### 3. **app/(auth)/verify-email.tsx** - Open Email App
- ✅ **Fixed:** "Open Email App" button now actually opens the email app
- Uses platform-specific schemes:
  - iOS: `message://` (opens Mail app)
  - Android: `mailto:` (opens default email app)
- Added auth state listener to auto-redirect when email is verified
- Updated resend email to include redirect URL

### 4. **app/(auth)/callback.tsx** - Handle Verification Links
- ✅ **Fixed:** Properly parses verification links from email
- Handles both hash (#) and query (?) parameters
- Shows status updates: "Verifying...", "Setting up session...", "Success!"
- Creates backend user profile automatically
- Routes to onboarding for new signups

### 5. **app/(auth)/register.tsx** - Include Redirect URL
- Updated signup to include `emailRedirectTo` parameter
- Fixed name reference bug (was passing ref object instead of value)

---

## 🚀 How to Test

### **Step 1: Rebuild the App**

The `app.json` changes require a new build:

```bash
# For development builds
npx expo prebuild --clean

# For iOS
npx expo run:ios

# For Android
npx expo run:android
```

**Important:** Don't use `npx expo start` for testing deep links - you need a native build!

---

### **Step 2: Test the Flow**

1. **Sign Up:**
   - Enter name, email, password
   - Click "Sign Up"
   - You'll be redirected to the verification screen

2. **Open Email App:**
   - Click "Open Email App" button
   - ✅ Should open your email app (not show alert anymore)

3. **Click Verification Link:**
   - Open the verification email
   - Click the verification link
   - ✅ Should open the FitAI app
   - ✅ Should show "Verifying your email..."
   - ✅ Should auto-redirect to onboarding

---

## 🔧 Supabase Dashboard Configuration

You need to configure the redirect URL in your Supabase dashboard:

### **Steps:**

1. Go to: https://app.supabase.com/project/YOUR_PROJECT/auth/url-configuration

2. Add to **Redirect URLs**:
   ```
   fitai:///(auth)/callback
   ```

3. For production, also add:
   ```
   com.eochi.fitai:///(auth)/callback
   ```

4. Click **Save**

---

## 📱 Platform-Specific Notes

### **iOS:**
- Deep links work automatically with the `scheme` in app.json
- For production, you'll need to set up Universal Links (associatedDomains)
- The `message://` scheme opens the native Mail app

### **Android:**
- The intentFilters handle both custom scheme and HTTPS links
- Deep links work with both `fitai://` and `https://*.supabase.co`
- The `mailto:` opens the default email app
- You may need to configure App Links verification for production

---

## 🐛 Troubleshooting

### **Deep link not opening the app?**

**Check:**
1. Did you rebuild the app after changing app.json? (`npx expo prebuild --clean`)
2. Is the redirect URL configured in Supabase dashboard?
3. Are you testing on a real device or simulator with email client?

**Test manually:**
```bash
# iOS Simulator
xcrun simctl openurl booted "fitai:///(auth)/callback#access_token=test&refresh_token=test&type=signup"

# Android
adb shell am start -W -a android.intent.action.VIEW -d "fitai:///(auth)/callback#access_token=test&refresh_token=test&type=signup" com.eochi.fitai
```

### **"Open Email App" shows alert instead of opening email?**

This means the device doesn't have a default email app configured.

**Solutions:**
- Install and configure an email app (Gmail, Outlook, etc.)
- The fallback alert is intentional for devices without email apps

### **Email verification link does nothing?**

**Check the link format:**
The email should contain a link like:
```
https://your-project.supabase.co/auth/v1/verify?token=...&type=signup&redirect_to=fitai:///(auth)/callback
```

If `redirect_to` is missing, check:
1. Did you pass `emailRedirectTo` in signup? ✅ (Fixed in register.tsx)
2. Is it configured in Supabase dashboard? (See above)

### **Still redirecting to browser instead of app?**

On some Android devices, you may need to:
1. Open the Supabase verification link
2. Click the address bar
3. Select "Open in FitAI app"

This is a one-time setup for the device.

---

## 🔒 Production Checklist

Before deploying:

- [ ] Configure redirect URLs in Supabase for production
- [ ] Set up Universal Links (iOS) - optional but recommended
- [ ] Set up App Links verification (Android) - optional but recommended
- [ ] Test on real devices (iOS and Android)
- [ ] Test with different email clients (Gmail, Outlook, Apple Mail)
- [ ] Verify error handling (expired links, invalid tokens)

---

## 📚 Additional Resources

- [Expo Linking Docs](https://docs.expo.dev/guides/linking/)
- [Supabase Auth Deep Linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [React Native Deep Linking](https://reactnavigation.org/docs/deep-linking/)

---

## ✨ What to Expect Now

### **Before (Broken):**
1. Click "Open Email App" → Shows alert ❌
2. Click verification link → Opens browser, nothing happens ❌

### **After (Fixed):**
1. Click "Open Email App" → Opens email app ✅
2. Click verification link → Opens FitAI app → Auto-verifies → Routes to onboarding ✅

---

## 🎉 You're All Set!

Just rebuild the app and test the flow. The deep linking should work seamlessly now!

If you run into issues, check the console logs - we've added detailed logging at each step.



