# SMTP Email Configuration Guide

## Quick Setup for Gmail

### Step 1: Enable 2-Factor Authentication
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Under "Signing in to Google", click **2-Step Verification**
3. Follow the prompts to enable 2FA (you'll need your phone)

### Step 2: Generate App Password
1. Go back to [Google Account Security](https://myaccount.google.com/security)
2. Under "Signing in to Google", click **App passwords**
3. Select **Mail** as the app
4. Select **Other (Custom name)** as the device
5. Type: `fit.ai backend`
6. Click **Generate**
7. **Copy the 16-character password** (you'll see it once, save it!)

### Step 3: Set Environment Variables on Render

#### Option A: Via Render Dashboard (Recommended)
1. Go to your Render service: https://dashboard.render.com
2. Select your backend service (fitai-api)
3. Go to **Environment** tab
4. Click **Add Environment Variable** for each:

```
SMTP_HOST = smtp.gmail.com
SMTP_PORT = 587
SMTP_USER = your-email@gmail.com
SMTP_PASSWORD = xxxx xxxx xxxx xxxx  (the 16-char app password from Step 2)
BETA_NOTIFY_EMAIL = your-email@gmail.com  (where you want notifications)
```

#### Option B: Via Render CLI
```bash
render env:set SMTP_HOST=smtp.gmail.com
render env:set SMTP_PORT=587
render env:set SMTP_USER=your-email@gmail.com
render env:set SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx
render env:set BETA_NOTIFY_EMAIL=your-email@gmail.com
```

### Step 4: Restart Your Service
After adding environment variables, Render will automatically restart your service.

### Step 5: Test It!
1. Submit a test signup on your website
2. Check your email inbox (the one in `BETA_NOTIFY_EMAIL`)
3. You should receive: "New Beta Signup: [Name] ([Device])"

---

## Troubleshooting

### "SMTP credentials not configured"
- Check that all 4 variables are set: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
- Make sure there are no extra spaces in the values

### "Authentication failed"
- Make sure you're using the **App Password**, not your regular Gmail password
- Verify 2FA is enabled on your Google account
- Try generating a new App Password

### "Connection timeout"
- Check that `SMTP_PORT=587` (not 465)
- Verify `SMTP_HOST=smtp.gmail.com` (not gmail.com)

### Email not received
- Check spam folder
- Verify `BETA_NOTIFY_EMAIL` is correct
- Check Render logs: `render logs --tail`

---

## Alternative: Other Email Providers

### Outlook/Hotmail
```
SMTP_HOST = smtp-mail.outlook.com
SMTP_PORT = 587
SMTP_USER = your-email@outlook.com
SMTP_PASSWORD = your-password
```

### Yahoo
```
SMTP_HOST = smtp.mail.yahoo.com
SMTP_PORT = 587
SMTP_USER = your-email@yahoo.com
SMTP_PASSWORD = your-app-password
```

### Custom SMTP (SendGrid, Mailgun, etc.)
```
SMTP_HOST = smtp.sendgrid.net
SMTP_PORT = 587
SMTP_USER = apikey
SMTP_PASSWORD = your-api-key
```

---

## Security Notes

✅ **DO:**
- Use App Passwords (not your main password)
- Keep environment variables secret
- Use different email for notifications if needed

❌ **DON'T:**
- Commit SMTP credentials to git
- Share your App Password
- Use your main Gmail password

---

**Need help?** Check Render logs or contact support.

