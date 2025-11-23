# Redis Setup Guide for FitAI Backend

**Purpose:** Redis is used for caching high-traffic endpoints (calendar, weekly summary) to support 100+ concurrent users.

**Service Used:** Redis Cloud (redis.io)  
**Last Updated:** November 19, 2025

---

## 📋 Table of Contents

1. [Why Redis?](#why-redis)
2. [Redis Cloud Setup](#redis-cloud-setup)
3. [Render Environment Setup](#render-environment-setup)
4. [Verification](#verification)
5. [Troubleshooting](#troubleshooting)

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

## 🚀 Redis Cloud Setup

### Step 1: Sign Up for Redis Cloud

1. **Go to:** https://redis.io/try-free/
2. **Sign up** for a free account (or log in if you have one)
3. **Create a free database** (30 MB free tier available)

### Step 2: Create Database

1. **In Redis Cloud Dashboard:**
   - Click **"New Database"** or **"Create Database"**
   - Choose **"Fixed"** plan (free tier)
   - Select **region** closest to your Render service (e.g., AWS us-east-1)
   - Name: `fitai-redis`
   - Click **"Activate"** or **"Create"**

### Step 3: Get Connection String

1. **Click on your database** in the dashboard
2. **Find "Public Endpoint"** or **"Endpoint"** section
3. **Copy the connection string:**
   - Format: `redis://default:password@host:port`
   - Example: `redis://default:AbCdEf123456@redis-12345.c123.us-east-1-1.ec2.cloud.redislabs.com:12345`

**Note:** The password is shown in the database details. Make sure to copy the full connection string including the password.

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
   (Use the connection string from Redis Cloud)
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
   - ✅ Correct: `redis://default:password@host:port`
   - ❌ Wrong: `redis://host:port` (missing password)
   - ❌ Wrong: `redis://password@host:port` (missing username)

2. **Network/firewall:**
   - Redis Cloud allows public connections by default
   - Check if your Render region can reach Redis Cloud
   - Verify the endpoint URL is correct

3. **Redis Cloud database not active:**
   - Check Redis Cloud dashboard
   - Ensure database is "Active" (not paused)
   - Free tier databases may pause after inactivity

**Fix:**
```bash
# Test connection locally
redis-cli -u redis://default:password@host:port ping
# Should return: PONG
```

### Issue: Cache not working

**Check:**
1. Redis is connected (see logs)
2. Cache keys are being set (check Redis Cloud dashboard)
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

## 💰 Redis Cloud Pricing

### Free Tier:
- **30 MB storage**
- **No credit card required**
- **Perfect for beta testing**

### Paid Plans:
- Start at ~$5-10/month for more storage
- Scale as needed
- Check https://redis.io/pricing for current rates

---

## 🎯 Next Steps

1. ✅ Create Redis Cloud database
2. ✅ Get connection string from Redis Cloud dashboard
3. ✅ Add `REDIS_URL` to Render environment
4. ✅ Redeploy backend
5. ✅ Verify in logs: "Connected to Redis"
6. ✅ Test API endpoints (should see faster responses)

---

## 📚 Additional Resources

- **Redis Cloud Dashboard:** https://redis.com/try-free/
- **Redis Cloud Docs:** https://docs.redis.com/
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
A: Cache auto-expires after 5 minutes. To manually clear via Redis Cloud dashboard or:
```bash
redis-cli -u your-redis-url
> KEYS fitai:calendar:*
> DEL key1 key2 key3 ...
```

**Q: What if my free tier database pauses?**  
A: Redis Cloud free tier may pause after inactivity. Just reactivate it in the dashboard - it takes a few seconds.

---

**Ready to set up?** Follow the steps above and you'll be caching in minutes! 🚀
