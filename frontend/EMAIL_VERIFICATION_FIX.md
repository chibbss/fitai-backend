# Email Verification Deep Link Fix 🔗

## Problem
When clicking the verification email link, a blank page appears instead of opening the app with a success message.

## Solution Overview
The issue is with deep linking configuration. We've fixed the app configuration and now you need to:
1. Configure Supabase with the correct redirect URL
2. Rebuild the app (native build required for deep links)
3. Test the flow

---

## Step 1: Configure Supabase Dashboard 🔧

### Go to your Supabase Dashboard:
1. Navigate to: https://app.supabase.com/project/YOUR_PROJECT_ID/auth/url-configuration

2. **Clear all existing redirect URLs** and add ONLY this one:
   ```
   fitai://auth-callback
   ```

3. Click **Save**

### Why only one URL?
- Multiple URLs can cause conflicts
- `fitai://auth-callback` matches your app structure exactly
- The `fitai://` scheme is defined in `app.json`
- The `auth-callback` route maps to `app/auth-callback.tsx`

---

## Step 2: Rebuild Your App 📱

**IMPORTANT:** Changes to `app.json` require a native rebuild. Expo Go and `npx expo start` won't work for testing deep links!

### For Development:

```bash
cd fitai-backend/frontend

# Clean rebuild
npx expo prebuild --clean

# For iOS (Mac only)
npx expo run:ios

# For Android
npx expo run:android
```

### What This Does:
- `prebuild --clean` regenerates native folders with updated `app.json` config
- `run:ios/android` builds and installs on simulator/device

---

## Step 3: Test the Email Verification Flow 🧪

### Complete Flow:

1. **Sign Up:**
   - Open the app
   - Go to Register
   - Enter name, email, password
   - Click "Sign Up"
   - You'll see "Verify Email" screen

2. **Open Email:**
   - Click "Open Email App" button
   - This should open your email app
   - Find the verification email from Supabase

3. **Click Verification Link:**
   - Click the "Confirm your mail" link in the email
   - **Expected behavior:**
     - ✅ App opens automatically
     - ✅ Shows "Verifying your email..." loading
     - ✅ Shows "Setting up your session..."
     - ✅ Shows "Email verified successfully! 🎉"
     - ✅ Auto-redirects to onboarding after 2 seconds

---

## Step 4: Manual Deep Link Testing 🔍

If the email link doesn't work, test the deep link manually:

### iOS Simulator:
```bash
xcrun simctl openurl booted "fitai://auth-callback"
```

### Android Device/Emulator:
```bash
adb shell am start -W -a android.intent.action.VIEW -d "fitai://auth-callback" com.eochi.fitai
```

### Expected Result:
- App should open
- Show auth-callback screen (even without tokens)
- Eventually redirect to login if no valid tokens

---

## Troubleshooting 🐛

### Issue: "Blank page after clicking email link"

**Causes:**
1. ❌ App not rebuilt after `app.json` changes
2. ❌ Wrong redirect URL in Supabase
3. ❌ Multiple conflicting redirect URLs in Supabase
4. ❌ Testing with Expo Go (doesn't support custom schemes)

**Solutions:**
- ✅ Rebuild with `npx expo prebuild --clean`
- ✅ Use only `fitai://auth-callback` in Supabase
- ✅ Test on native build, not Expo Go

---

### Issue: "Opens browser instead of app"

**Android Only:**
- First time clicking a Supabase link on Android may open browser
- Browser will show "Open in app" option
- Click it once, then future links will open app directly

**Permanent Fix (Optional):**
- Set up Android App Links verification (for production)

---

### Issue: "App opens but shows error"

**Check Console Logs:**
```javascript
// In auth-callback.tsx, we log everything:
console.log('Callback URL:', url);
console.log('Parsed params:', params);
```

**Common Errors:**
- `No tokens found` → Link expired or malformed
- `Session error` → Token validation failed
- `Backend API error` → Backend server not running (non-blocking)

---

### Issue: "Email link format is wrong"

**Correct Format:**
```
https://yourproject.supabase.co/auth/v1/verify?token=...&type=signup&redirect_to=fitai://auth-callback
```

**Key Parts:**
- `redirect_to=fitai://auth-callback` must be present
- If missing, check that `emailRedirectTo` is passed in signup (it is in register.tsx line 58)

---

## What Changed? 📝

### 1. `app.json` (Android Intent Filters)
- Split intent filters into two separate entries
- One for Supabase HTTPS URLs (for initial click)
- One for fitai:// custom scheme (for redirect)
- Removed host restriction to allow all fitai:// paths

### 2. `auth-callback.tsx` (React Hook Fix)
- Fixed useEffect to properly handle async function
- Prevents React warnings and potential bugs
- Removed broken reset-password navigation

### 3. `supabase.ts` (Comments)
- Added clarity about redirect URL structure

---

## How Deep Linking Works 🎯

### Flow Diagram:

```
1. User clicks email link:
   https://project.supabase.co/auth/v1/verify?token=...&redirect_to=fitai://auth-callback

2. Android/iOS opens link:
   → Intent filter matches *.supabase.co
   → Opens browser OR processes directly

3. Supabase validates token:
   → If valid, redirects to: fitai://auth-callback#access_token=...&refresh_token=...

4. Custom scheme opens app:
   → Intent filter matches fitai:// scheme
   → Opens app at /auth-callback route

5. auth-callback.tsx runs:
   → Parses URL hash parameters
   → Calls supabase.auth.setSession()
   → Creates backend profile
   → Shows success message
   → Redirects to onboarding
```

---

## Production Considerations 🚀

For production builds, consider:

1. **Universal Links (iOS):**
   - Set up `associatedDomains` in app.json
   - Configure apple-app-site-association file
   - Allows opening app without custom scheme

2. **App Links (Android):**
   - Set `autoVerify: true` in intent filters (already done)
   - Set up assetlinks.json on your domain
   - Allows seamless app opening

3. **Custom Domain:**
   - Instead of `fitai://`, use `https://yourdomain.com/auth/callback`
   - More professional and works better on some platforms

---

## Summary ✅

### What to Do Now:

1. ✅ Update Supabase redirect URLs (only `fitai://auth-callback`)
2. ✅ Run `npx expo prebuild --clean`
3. ✅ Run `npx expo run:ios` or `npx expo run:android`
4. ✅ Test signup → verify email → click link
5. ✅ Verify app opens with success message

### Expected Result:
- Click email link → App opens → Success message → Redirects to onboarding

### If Still Not Working:
- Check Supabase has correct URL saved
- Check you rebuilt the app (not using Expo Go)
- Check console logs for errors
- Test manual deep link (see Step 4 above)

---

Need help? Check the console logs - we've added detailed logging at every step!

