# Redis Setup Guide for FitAI Backend

**Purpose:** Redis is used for caching high-traffic endpoints (calendar, weekly summary) to support 100+ concurrent users.

**Last Updated:** November 19, 2025

---

## 📋 Table of Contents

1. [Why Redis?](#why-redis)
2. [Quick Setup Options](#quick-setup-options)
3. [Render Environment Setup](#render-environment-setup)
4. [Verification](#verification)
5. [Troubleshooting](#troubleshooting)
6. [Cost Considerations](#cost-considerations)

---

## 🎯 Why Redis?

**Current Problem:**
- Calendar and weekly summary endpoints are called frequently
- Each request hits the database multiple times
- With 100+ concurrent users, database connection pool gets exhausted

**Solution:**
- Cache responses for 5 minutes
- Reduces database load by ~80-90%
- Improves response times
- Redis is optional - app works without it (just slower)

---

## 🚀 Quick Setup Options

### Option 1: Upstash Redis (Recommended - Free Tier Available)

**Best for:** Beta testing, cost-conscious

1. **Sign up:** https://upstash.com/
2. **Create Redis Database:**
   - Click "Create Database"
   - Choose "Regional" (closest to your Render region)
   - Name: `fitai-redis`
   - Click "Create"

3. **Get Connection String:**
   - Click on your database
   - Copy the "REST URL" or "Redis URL"
   - Format: `redis://default:password@host:port`

4. **Add to Render:**
   - Go to Render Dashboard → Your Service → Environment
   - Add: `REDIS_URL=redis://default:password@host:port`
   - Save and redeploy

**Free Tier Limits:**
- 10,000 commands/day
- 256 MB storage
- Perfect for beta testing

---

### Option 2: Render Redis (Easiest)

**Best for:** Simple setup, already using Render

1. **Create Redis Instance:**
   - Render Dashboard → "New +" → "Redis"
   - Name: `fitai-redis`
   - Plan: Free tier (or paid if needed)
   - Region: Same as your backend service
   - Click "Create Redis"

2. **Get Connection String:**
   - Click on your Redis instance
   - Copy "Internal Redis URL" (for same region) or "External Redis URL"
   - Format: `redis://:password@host:port`

3. **Add to Backend Service:**
   - Go to your backend service → Environment
   - Add: `REDIS_URL=redis://:password@host:port`
   - Save and redeploy

**Note:** Render Redis free tier has limits. Check pricing.

---

### Option 3: Railway Redis

**Best for:** If you're using Railway for other services

1. **Create Redis:**
   - Railway Dashboard → "New" → "Database" → "Add Redis"
   - Name: `fitai-redis`

2. **Get Connection String:**
   - Click on Redis service
   - Copy "REDIS_URL" from Variables tab

3. **Add to Render:**
   - Render Dashboard → Your Service → Environment
   - Add: `REDIS_URL=<railway-redis-url>`
   - Save and redeploy

---

### Option 4: Self-Hosted (Advanced)

**Best for:** Full control, existing infrastructure

1. **Install Redis:**
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install redis-server
   
   # macOS
   brew install redis
   ```

2. **Start Redis:**
   ```bash
   redis-server
   ```

3. **Get Connection String:**
   - Default: `redis://localhost:6379`
   - With password: `redis://:password@localhost:6379`

4. **Add to Render:**
   - Use external IP if hosting on separate server
   - Format: `redis://:password@your-server-ip:6379`

---

## ⚙️ Render Environment Setup

### Step 1: Add Environment Variable

1. Go to **Render Dashboard** → Your Backend Service
2. Click **"Environment"** tab
3. Click **"Add Environment Variable"**
4. Add:
   ```
   Key: REDIS_URL
   Value: redis://default:password@host:port
   ```
5. Click **"Save Changes"**

### Step 2: Redeploy

Render will automatically redeploy when you save environment variables.

**Or manually trigger:**
- Click **"Manual Deploy"** → **"Deploy latest commit"**

---

## ✅ Verification

### Test 1: Check Logs

After deployment, check Render logs for:

```
Connected to Redis at redis://...
```

If you see this, Redis is working! ✅

If you see:
```
Redis unavailable: ...
```

Redis is not connected. Check your `REDIS_URL` format.

### Test 2: API Test

```bash
# Test calendar endpoint (should be fast on second call)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-api.render.com/workouts/calendar

# First call: ~200-500ms (cache miss)
# Second call: ~50-100ms (cache hit)
```

### Test 3: Check Cache Behavior

1. **Call calendar endpoint** → Note response time
2. **Call again immediately** → Should be faster (cached)
3. **Wait 5 minutes** → Call again → Should be slower (cache expired)

---

## 🔧 Troubleshooting

### Issue: "Redis unavailable" in logs

**Possible causes:**
1. **Wrong URL format:**
   - ✅ Correct: `redis://default:password@host:6379`
   - ❌ Wrong: `redis://host:6379` (missing password)
   - ❌ Wrong: `redis://password@host:6379` (missing username)

2. **Network/firewall:**
   - Check if Redis allows external connections
   - Check firewall rules
   - For Render Redis, use "Internal URL" if same region

3. **Redis not running:**
   - Check Redis service status
   - Verify Redis is accessible from Render's network

**Fix:**
```bash
# Test connection locally
redis-cli -u redis://default:password@host:6379 ping
# Should return: PONG
```

### Issue: Cache not working

**Check:**
1. Redis is connected (see logs)
2. Cache keys are being set (check Redis directly)
3. TTL is correct (5 minutes = 300 seconds)

**Debug:**
```python
# In Python shell (on Render)
import redis
r = redis.Redis.from_url("your-redis-url")
r.keys("fitai:*")  # Should show cache keys
```

### Issue: Stale data

**Cause:** Cache not invalidating when workouts are logged

**Fix:** Already implemented! Cache is automatically invalidated when:
- New workout is logged
- Workout is updated

Check logs for:
```
Invalidated calendar caches for user ...
Invalidated weekly summary caches for user ...
```

---

## 💰 Cost Considerations

### Upstash (Recommended for Beta)

- **Free Tier:** 10,000 commands/day, 256 MB
- **Paid:** $0.20 per 100K commands, $0.10/GB storage
- **Estimated cost for 100 users:** ~$5-10/month

### Render Redis

- **Free Tier:** Limited (check current pricing)
- **Paid:** ~$7-15/month
- **Best for:** Simple setup, already on Render

### Railway Redis

- **Free Tier:** 512 MB, 5 GB egress
- **Paid:** ~$5-10/month
- **Best for:** If using Railway for other services

### Self-Hosted

- **Cost:** Server costs only
- **Best for:** High volume, existing infrastructure

---

## 📊 Expected Performance Impact

### Without Redis:
- Calendar endpoint: ~200-500ms (database queries)
- Weekly summary: ~300-600ms (multiple queries)
- Database connections: High usage

### With Redis:
- Calendar endpoint: ~50-100ms (cached) or ~200-500ms (cache miss)
- Weekly summary: ~50-100ms (cached) or ~300-600ms (cache miss)
- Database connections: ~80-90% reduction
- Cache hit rate: ~70-80% (for frequently accessed data)

---

## 🎯 Next Steps

1. ✅ Choose a Redis provider (Upstash recommended)
2. ✅ Create Redis instance
3. ✅ Add `REDIS_URL` to Render environment
4. ✅ Redeploy backend
5. ✅ Verify in logs: "Connected to Redis"
6. ✅ Test API endpoints (should see faster responses)

---

## 📚 Additional Resources

- **Upstash Docs:** https://docs.upstash.com/redis
- **Render Redis:** https://render.com/docs/redis
- **Redis Commands:** https://redis.io/commands/

---

## ❓ Questions?

**Q: Do I need Redis for beta testing?**  
A: Not required, but highly recommended for 100+ users. App works without it, just slower.

**Q: What happens if Redis goes down?**  
A: App continues working, just without caching. All requests hit database directly.

**Q: Can I use Redis for other things?**  
A: Yes! Currently used for:
- Calendar caching
- Weekly summary caching
- Embedding caching (if enabled)
- Session storage (if enabled)

**Q: How do I clear the cache?**  
A: Cache auto-expires after 5 minutes. To manually clear:
```bash
redis-cli -u your-redis-url
> KEYS fitai:calendar:*
> DEL key1 key2 key3 ...
```

---

**Ready to set up?** Follow the steps above and you'll be caching in minutes! 🚀

