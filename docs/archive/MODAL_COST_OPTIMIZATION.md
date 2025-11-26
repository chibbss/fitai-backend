# Modal Cost Optimization Guide

**Last Updated:** November 24, 2025

---

## Current Setup (Cost-Optimized)

### Services Deployed:
1. **vLLM Service (A10G GPU)**
   - Scale-to-zero: 5 minutes (`scaledown_window=300`)
   - Max model length: 8192 tokens (capped for A10G compatibility)
   - Cost: ~$0.70/hour when running

2. **Embedding Service (T4 GPU)**
   - Scale-to-zero: 1 minute (`scaledown_window=60`)
   - Cost: ~$0.40/hour when running

### Cost Breakdown:
- **A10G GPU:** ~$0.70/hour = ~$17/day if running 24/7
- **T4 GPU:** ~$0.40/hour = ~$10/day if running 24/7
- **Total if always on:** ~$27/day = ~$810/month ❌

### With Scale-to-Zero (Current):
- **Low traffic (10-50 users):** ~$30-50/month ✅
- **Medium traffic (50-200 users):** ~$50-150/month ✅
- **High traffic (200-500 users):** ~$150-300/month ⚠️

---

## Cost Optimization Strategies

### 1. Current Setup (Scale-to-Zero) ✅ RECOMMENDED

**How it works:**
- Containers shut down after idle timeout
- Only pay when services are actually running
- Cold starts: 10-30s (vLLM), 5-10s (embedding)

**Best for:**
- Low to medium traffic
- Cost-conscious deployments
- Acceptable cold starts

**Cost:** ~$30-150/month depending on usage

---

### 2. Pre-Warm During Peak Hours

**How it works:**
- Keep containers warm during known peak hours (e.g., 6am-10pm)
- Scale-to-zero during off-peak hours (e.g., 10pm-6am)

**Implementation:**
```python
# Schedule a ping every 4 minutes during peak hours
# Keeps container alive (scaledown_window=300 = 5 min)
```

**Best for:**
- Predictable usage patterns
- Want to eliminate cold starts during peak
- Willing to pay for warm containers during peak

**Cost:** ~$100-200/month (depends on peak hours)

---

### 3. Use Smaller/Cheaper GPUs

**Options:**
- **T4 for vLLM:** ~$0.40/hour (vs A10G $0.70/hour)
  - ⚠️ Slower, but 40% cheaper
  - May need to reduce max_model_len further (4096 tokens)
  
- **L4 for embeddings:** ~$0.30/hour (vs T4 $0.40/hour)
  - 25% cheaper, similar performance

**Best for:**
- Cost is primary concern
- Can accept slower responses
- Lower traffic

**Cost:** ~$20-100/month

---

### 4. Hybrid: Local + Modal

**How it works:**
- Use local models for low-traffic periods
- Use Modal for high-traffic periods
- Or: Local for embeddings, Modal for chat

**Best for:**
- Have local GPU available
- Want maximum cost control
- Complex setup

**Cost:** ~$10-50/month (Modal) + local GPU costs

---

### 5. Queue System (For 1k+ Users)

**How it works:**
- Accept all requests, process in queue
- Fewer Modal instances needed
- Better cost efficiency at scale

**Best for:**
- High traffic (500+ users)
- Want to control costs at scale
- Can accept queue delays

**Cost:** ~$200-400/month (fewer instances needed)

---

## Cost Comparison

| Strategy | Monthly Cost (Low Traffic) | Monthly Cost (High Traffic) | Cold Starts |
|----------|----------------------------|-----------------------------|-------------|
| **Scale-to-Zero (Current)** | $30-50 | $150-300 | Yes (10-30s) |
| **Pre-Warm Peak Hours** | $100-150 | $200-400 | No (during peak) |
| **Smaller GPUs** | $20-40 | $100-200 | Yes (10-30s) |
| **Hybrid Local+Modal** | $10-30 | $50-150 | No (local) |
| **Queue System** | N/A | $200-400 | No |

---

## Recommendations by Traffic Level

### 10-50 Users (Beta)
- **Strategy:** Scale-to-zero (current) ✅
- **Cost:** ~$30-50/month
- **Action:** Keep as-is, monitor usage

### 50-200 Users (Early Growth)
- **Strategy:** Scale-to-zero + pre-warm during peak (if needed)
- **Cost:** ~$50-150/month
- **Action:** Monitor cold starts, pre-warm if they become a problem

### 200-500 Users (Growth Phase)
- **Strategy:** Pre-warm during peak + scale-to-zero off-peak
- **Cost:** ~$150-300/month
- **Action:** Implement pre-warm, consider second vLLM instance

### 500-1k Users (Scale Phase)
- **Strategy:** Multiple instances + queue system
- **Cost:** ~$300-500/month
- **Action:** Deploy 2-3 vLLM instances, implement queue

### 1k+ Users (Mature)
- **Strategy:** Optimize everything + consider alternatives
- **Cost:** ~$400-600/month
- **Action:** Consider dedicated GPU instances, optimize model size

---

## Immediate Cost Savings

### 1. Increase Idle Timeout (If Acceptable)
```python
# Current: 5 minutes
scaledown_window=300

# Option: 10 minutes (fewer cold starts, slightly higher cost)
scaledown_window=600
```

**Impact:** ~20% cost increase, but fewer cold starts

### 2. Use T4 for vLLM (If Performance Acceptable)
```python
# Current: A10G ($0.70/hour)
gpu="A10G"

# Option: T4 ($0.40/hour)
gpu="T4"
# Also need to reduce max_model_len to 4096
```

**Impact:** 40% cost reduction, but slower responses

### 3. Optimize Model Size
- Current: Llama 3.1 8B (good balance)
- Smaller: Llama 3.1 1B (faster, cheaper, less capable)
- Larger: Llama 3.1 70B (slower, expensive, more capable)

**Impact:** Significant cost/performance trade-off

---

## Monitoring Costs

### Modal Dashboard:
- Track GPU hours used
- Monitor cold start frequency
- Track cost per request

### Key Metrics:
- **GPU hours/day:** Should be < 24 for scale-to-zero
- **Cold start frequency:** Track how often containers restart
- **Cost per user:** Target < $0.50/user/month

---

## Bottom Line

**Current setup is cost-optimized for beta:**
- Scale-to-zero saves ~90% vs always-on
- Expected cost: ~$30-50/month for 10-50 users
- Can scale up as you grow

**If costs are still too high:**
1. Switch vLLM to T4 GPU (40% cheaper)
2. Increase idle timeout (fewer restarts)
3. Use local fallback more aggressively
4. Consider smaller model (if acceptable)

**For now:** Keep scale-to-zero, monitor usage, optimize based on real data.

---

**Remember:** You're paying for compute, not idle time. Scale-to-zero is your friend! 🎯

