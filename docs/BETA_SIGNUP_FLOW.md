# Beta Signup Flow - Complete Documentation

## Overview
This document describes the complete end-to-end flow for the beta signup form on fitailive.com.

## Architecture

```
User Browser (fitailive.com/signup.html)
    ↓ [POST request with CORS]
Backend API (fitai-api.onrender.com/beta/signup)
    ↓ [Database insert]
PostgreSQL (beta_signups table)
    ↓ [Email notification]
SMTP Server (Gmail)
```

## Components

### 1. Frontend (`website/fitai-website/signup.html`)
- **Location**: Static HTML file served from fitailive.com
- **API Endpoint**: `https://fitai-api.onrender.com/beta/signup`
- **Method**: POST
- **Payload**:
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "device": "iOS" | "Android",
    "agreement": true
  }
  ```

### 2. Backend Endpoint (`main.py`)
- **Route**: `POST /beta/signup`
- **Authentication**: None (public endpoint)
- **Rate Limiting**: 10 requests/minute per IP
- **CORS**: Enabled for `https://fitailive.com` and `https://www.fitailive.com`

### 3. Database (`migrations/versions/2025_12_23_beta_signups.py`)
- **Table**: `beta_signups`
- **Columns**:
  - `id` (String, PK)
  - `name` (String, required)
  - `email` (String, required, indexed)
  - `device` (String, required)
  - `status` (String, default: "pending")
  - `meta_data` (JSONB, nullable)
  - `created_at` (Timestamp)
  - `updated_at` (Timestamp)

### 4. Email Notification (`main.py` - `_send_beta_signup_email`)
- **Service**: SMTP (Gmail)
- **Configuration**: Environment variables
  - `SMTP_HOST=smtp.gmail.com`
  - `SMTP_PORT=587`
  - `SMTP_USER=your-email@gmail.com`
  - `SMTP_PASSWORD=app-password`
  - `BETA_NOTIFY_EMAIL=your-email@gmail.com`

## Current Issues & Troubleshooting

### Issue: "Network error: Could not connect to server"

**Possible Causes:**
1. **CORS Preflight Failure**: Browser sends OPTIONS request that's being blocked
2. **Code Not Deployed**: Latest code with CORS not deployed to Render
3. **Backend URL Incorrect**: API_BASE_URL doesn't match actual Render service
4. **Database Migration Not Run**: `beta_signups` table doesn't exist

**Diagnostics:**

1. **Check if endpoint exists:**
   ```bash
   curl -X OPTIONS https://fitai-api.onrender.com/beta/signup \
     -H "Origin: https://www.fitailive.com" \
     -H "Access-Control-Request-Method: POST" \
     -v
   ```
   
   **Expected**: 200 OK with CORS headers
   **If fails**: CORS not configured or code not deployed

2. **Test POST directly:**
   ```bash
   curl -X POST https://fitai-api.onrender.com/beta/signup \
     -H "Content-Type: application/json" \
     -H "Origin: https://www.fitailive.com" \
     -d '{"name":"Test","email":"test@example.com","device":"iOS","agreement":true}'
   ```
   
   **Expected**: 201 Created with JSON response
   **If fails**: Endpoint not deployed or database issue

3. **Check browser console:**
   - Open DevTools (F12)
   - Go to Network tab
   - Submit form
   - Check for:
     - OPTIONS request (preflight) - should return 200
     - POST request - should return 201
     - CORS error (red text)

## Step-by-Step Fix

### Step 1: Verify Deployment
1. Check Render dashboard: Is the latest commit deployed?
2. Check Render logs: Any errors during startup?
3. Verify CORS is configured: Look for log line "CORS configured for origins: ..."

### Step 2: Run Database Migration
On Render (via shell/console):
```bash
alembic upgrade head
```

Verify table exists:
```sql
SELECT * FROM beta_signups LIMIT 1;
```

### Step 3: Test CORS
In browser console (on fitailive.com):
```javascript
fetch('https://fitai-api.onrender.com/beta/signup', {
  method: 'OPTIONS',
  headers: {
    'Origin': 'https://www.fitailive.com',
    'Access-Control-Request-Method': 'POST'
  }
}).then(r => {
  console.log('Status:', r.status);
  console.log('CORS Headers:', {
    'access-control-allow-origin': r.headers.get('access-control-allow-origin'),
    'access-control-allow-methods': r.headers.get('access-control-allow-methods')
  });
});
```

### Step 4: Test Full Flow
In browser console:
```javascript
fetch('https://fitai-api.onrender.com/beta/signup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Origin': 'https://www.fitailive.com'
  },
  body: JSON.stringify({
    name: "Test User",
    email: "test@example.com",
    device: "iOS",
    agreement: true
  })
}).then(r => r.json()).then(console.log).catch(console.error);
```

## Known Issues & Fixes

### Issue 1: Parameter Mismatch (FIXED)
- **Problem**: SQL parameter `:metadata` but dict key `"meta_data"`
- **Fix**: Change dict key to `"metadata"` (matches SQL placeholder)

### Issue 2: Checkbox Overlap (FIXED)
- **Problem**: Checkbox input overlapping with text
- **Fix**: Proper flex layout with gap and positioning

### Issue 3: CORS Middleware Order
- **Current**: CORS added first (correct)
- **Note**: Middleware order matters - CORS must be first

## Environment Variables (Render)

```bash
# CORS (optional - defaults shown)
CORS_ORIGINS=https://fitailive.com,https://www.fitailive.com

# Email/SMTP (required for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
BETA_NOTIFY_EMAIL=your-email@gmail.com
```

## Success Criteria

✅ User fills form on fitailive.com/signup.html
✅ Form submits to backend successfully
✅ Data saved to `beta_signups` table
✅ Email notification sent (if SMTP configured)
✅ User redirected to thank-you.html
✅ No console errors in browser

## Next Steps After Fix

1. Deploy latest code to Render
2. Run migration: `alembic upgrade head`
3. Configure SMTP (optional but recommended)
4. Test end-to-end flow
5. Monitor Render logs for errors

