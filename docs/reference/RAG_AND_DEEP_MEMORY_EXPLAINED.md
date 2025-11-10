# RAG and Deep Memory Architecture Explained

## Overview

FitAI uses a **hybrid RAG (Retrieval-Augmented Generation) + Deep Memory** system to provide personalized, contextually-aware fitness coaching. This document explains how these two systems work together to make FitAI feel like it truly knows each user.

---

## 🧠 The Two-Layer System

### 1. **RAG (Retrieval-Augmented Generation)**
**Purpose:** Provides accurate, evidence-based fitness knowledge from a curated knowledge base.

**How it works:**
- User asks a question (e.g., "How do I build muscle?")
- System embeds the query into a vector (384-dimensional using `sentence-transformers/all-MiniLM-L6-v2`)
- Searches the knowledge base (PDFs, fitness documents) using cosine similarity
- Retrieves top 5 most relevant chunks
- Reranks results using `cross-encoder/ms-marco-MiniLM-L-6-v2` for better relevance
- Includes retrieved chunks in the prompt as `[KB 1]`, `[KB 2]`, etc.

**What it provides:**
- General fitness knowledge (e.g., "ACSM recommends 2-3 strength sessions per week")
- Exercise form guidance
- Nutrition principles
- Safety information

**Limitation:** RAG alone doesn't know anything about the specific user.

---

### 2. **Deep Memory System**
**Purpose:** Remembers everything about each user - their goals, history, patterns, and conversations.

**How it works:**
- Stores user data in multiple layers (from permanent to recent)
- Retrieves relevant memories using semantic search
- Accumulates summaries over time (doesn't overwrite)
- Provides context about the user's journey

**What it provides:**
- User's goals and preferences (from onboarding)
- Workout history and patterns
- Long-term progress summaries
- Conversation history
- Detected patterns (e.g., "You train most on Mondays", "You've been skipping leg day")

---

## 🔄 How They Work Together

When a user sends a message, FitAI builds a **multi-layered context** that combines both systems:

```
┌─────────────────────────────────────────────────────────┐
│                    USER QUERY                            │
│         "How can I improve my bench press?"             │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              CONTEXT ASSEMBLY                            │
│                                                          │
│  1. ABOUT THIS USER (Static - from onboarding)          │
│     - Goal: build muscle                                │
│     - Experience: beginner                              │
│     - Preference: strength training                     │
│                                                          │
│  2. LONG-TERM PATTERNS (Deep Memory - accumulated)     │
│     - Week 1: "User trained 3x/week, focus on strength" │
│     - Week 2: "User increased volume, added cardio"     │
│     - Week 3: "User switched to 4x/week, more advanced" │
│                                                          │
│  3. FITNESS OVERVIEW (Deep Memory - current stats)      │
│     - This week: 4 sessions, 6h total                   │
│     - Top exercises: Bench Press (5x), Squat (3x)      │
│     - Pattern: heavy on push, light on legs            │
│                                                          │
│  4. USER PATTERNS (Deep Memory - detected)              │
│     - "You train most on Mondays (4x this month)"       │
│     - "You've been consistent for 7 consecutive days"   │
│                                                          │
│  5. RECENT WORKOUTS (Deep Memory - semantic search)     │
│     [Log 1] (Push Day) Bench Press: 3x5 @ 135lbs       │
│     [Log 2] (Push Day) Bench Press: 3x5 @ 140lbs       │
│                                                          │
│  6. RECENT CONVERSATION (Deep Memory - chat history)    │
│     user: "I want to get stronger"                     │
│     assistant: "Great! Let's focus on progressive..."  │
│                                                          │
│  7. FITNESS KNOWLEDGE (RAG - from knowledge base)       │
│     [KB 1] Progressive overload is key to strength...  │
│     [KB 2] Bench press form: keep feet flat, arch...   │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              AI GENERATION                              │
│                                                          │
│  LLM receives:                                          │
│  - System prompt (FitAI personality)                    │
│  - All context layers above                             │
│  - User's current query                                 │
│                                                          │
│  Generates personalized response that:                 │
│  - References their specific history ("I see you've    │
│    been benching 135-140lbs...")                        │
│  - Uses knowledge base for accuracy ("Progressive      │
│    overload means...")                                  │
│  - Shows personality ("That's solid progress! 🔥")      │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Deep Memory Layers (Deep → Shallow)

### Layer 1: **Static Memory** (Permanent)
- **Source:** `users.profile`, `users.goals`, `users.metadata`
- **When created:** During onboarding
- **Retrieval:** Always included (no search needed)
- **Example:**
  ```
  Goal: build muscle
  Experience: beginner
  Preference: strength training
  Constraints: lower back injury (avoid heavy deadlifts)
  ```

### Layer 2: **Memory Summaries** (Accumulated History)
- **Source:** `user_memory` table - AI-generated summaries
- **When created:** 
  - Onboarding completion (first summary)
  - Every 24 hours (workout summaries)
  - Weekly (conversation summaries)
- **Retrieval:** Top 5 most semantically relevant summaries
- **Key feature:** **Accumulates** (doesn't overwrite) - creates growing history
- **Example:**
  ```
  Week 1: "User trained 3x/week, focus on strength, beginner level"
  Week 2: "User increased volume, added cardio, showing consistency"
  Week 3: "User switched to 4x/week, more advanced exercises, PRs on bench"
  ```

### Layer 3: **Training Logs** (Full History)
- **Source:** `training_logs` table - every workout, event, note
- **When created:** Every time a workout is logged
- **Retrieval:** Semantic search (top 5 most similar to query)
- **Example:**
  ```
  [Log 1] (Push Day) Bench Press: 3x5 @ 135lbs, felt strong
  [Log 2] (Push Day) Bench Press: 3x5 @ 140lbs, PR!
  ```

### Layer 4: **Session Context** (Conversation History)
- **Source:** `chat_messages` table - all conversation messages
- **When created:** Every user/assistant message
- **Retrieval:** Last 20 messages from current session
- **Key feature:** **Persistent** (survives server restarts)
- **Example:**
  ```
  user: "I want to improve my bench press"
  assistant: "Great! Let's focus on progressive overload..."
  user: "How many sets should I do?"
  ```

### Layer 5: **Fitness Overview** (Current Stats)
- **Source:** Calculated from `workout_sessions` and `exercise_logs`
- **When created:** On-demand (cached for 5 minutes)
- **Retrieval:** Always included if available
- **Example:**
  ```
  This week: 4 sessions, 6h total
  This month: 15 sessions
  Top exercises: Bench Press (5x), Squat (3x)
  Pattern: heavy on push, light on legs
  Recovery: 1.5 day avg between sessions
  ```

### Layer 6: **User Patterns** (Detected Behaviors)
- **Source:** Calculated from workout history
- **When created:** On-demand (cached for 5 minutes)
- **Retrieval:** Always included if available
- **Example:**
  ```
  - "You train most on Mondays (4x this month)"
  - "You've been consistent for 7 consecutive days"
  - "You've been skipping leg day (no leg exercises in recent workouts)"
  ```

---

## 🔍 Retrieval Process

### Step 1: Query Embedding
```python
query = "How can I improve my bench press?"
query_vector = embed([query])  # 384-dimensional vector
```

### Step 2: Multi-Source Retrieval

**A. Knowledge Base (RAG)**
```python
# Search chunks table using cosine similarity
kb_chunks = search_chunks(query_vector, top_k=5)
# Rerank for better relevance
kb_chunks = rerank(query, kb_chunks, top_k=5)
```

**B. Training Logs (Deep Memory)**
```python
# Semantic search across all user's workout logs
recent_logs = search_training_logs(user_id, query, top_k=5)
```

**C. Memory Summaries (Deep Memory)**
```python
# Semantic search across accumulated summaries
memories = search_memories(user_id, query, top_k=5)
```

**D. Session Messages (Deep Memory)**
```python
# Get last 20 messages from current session
session_messages = get_session_messages(user_id, session_id, limit=20)
```

### Step 3: Context Assembly
All retrieved pieces are assembled into a structured prompt:

```
ABOUT THIS USER:
[Static profile from onboarding]

LONG-TERM PATTERNS:
- [Memory summary 1]
- [Memory summary 2]
...

FITNESS OVERVIEW:
[Current stats and patterns]

USER PATTERNS:
- [Detected pattern 1]
- [Detected pattern 2]
...

RECENT WORKOUTS:
[Log 1] (Push Day) Bench Press: 3x5 @ 135lbs
[Log 2] (Push Day) Bench Press: 3x5 @ 140lbs
...

RECENT CONVERSATION:
user: [previous message]
assistant: [previous response]
...

FITNESS KNOWLEDGE:
[KB 1] Progressive overload is key to strength gains...
[KB 2] Bench press form: keep feet flat, arch back...
...
```

### Step 4: Generation
The LLM receives this rich context and generates a personalized response that:
- References the user's specific history
- Uses knowledge base for accuracy
- Shows personality and warmth
- Provides actionable advice

---

## 🚀 Performance Optimizations

### 1. **Pre-loaded Context**
- On login, FitAI pre-loads user context (static summary, memories, fitness overview, patterns, recent workouts)
- Cached for 10 minutes
- **Result:** Chat responses are 3-5x faster (no need to query database on every message)

### 2. **Caching**
- **Fitness Overview:** Cached for 5 minutes
- **User Patterns:** Cached for 5 minutes
- **Workout Hooks:** Cached for 1 hour
- **Pre-loaded Context:** Cached for 10 minutes

### 3. **Selective Retrieval**
- Only query-specific data (KB chunks, training logs, memories) is retrieved per message
- Session messages are always fresh (loaded on-demand)
- Everything else comes from pre-loaded context

---

## 💾 Storage Architecture

### Database Tables

1. **`users`** - Static profile data
   - `profile`: JSONB (experience, preferences, constraints)
   - `goals`: JSONB (primary goal, target weight, etc.)

2. **`user_memory`** - Accumulated summaries
   - `summary`: TEXT (AI-generated summary)
   - `embedding`: VECTOR(384) (for semantic search)
   - `source`: STRING (e.g., "onboarding_summary", "workout_summary", "conversation_summary")
   - `meta_data`: JSONB (date ranges, log counts, etc.)

3. **`training_logs`** - All workout history
   - `notes`: TEXT (workout summary)
   - `embedding`: VECTOR(384) (for semantic search)
   - `occurred_at`: TIMESTAMP
   - `tags`: ARRAY (exercise names for filtering)

4. **`chat_messages`** - Conversation history
   - `role`: STRING ("user" or "assistant")
   - `content`: TEXT (message text)
   - `created_at`: TIMESTAMP (indexed for chronological ordering)

5. **`chunks`** - Knowledge base documents
   - `text`: TEXT (document chunk)
   - `embedding`: VECTOR(384) (for semantic search)
   - `meta_data`: JSONB (source PDF, page number, etc.)

### Vector Search
- Uses **pgvector** extension for PostgreSQL
- **HNSW index** for fast approximate nearest neighbor search
- **Cosine similarity** for semantic matching

---

## 🎯 Example Flow

**User:** "How can I improve my bench press?"

**Step 1: Context Retrieval**
- RAG: Finds knowledge base chunks about bench press form and progressive overload
- Deep Memory: Finds user's recent bench press logs (135lbs → 140lbs progression)
- Deep Memory: Finds relevant memory summaries (e.g., "User focused on strength training")
- Deep Memory: Includes fitness overview (shows bench press is top exercise, 5x this month)
- Deep Memory: Includes patterns (e.g., "You train most on Mondays")
- Deep Memory: Includes recent conversation (if any)

**Step 2: Context Assembly**
```
ABOUT THIS USER:
Goal: build muscle, Experience: beginner, Preference: strength training

LONG-TERM PATTERNS:
- User focused on strength training, beginner level
- User showing consistency, 3-4x per week

FITNESS OVERVIEW:
This week: 4 sessions, 6h total
Top exercises: Bench Press (5x), Squat (3x)
Pattern: heavy on push

USER PATTERNS:
- You train most on Mondays (4x this month)

RECENT WORKOUTS:
[Log 1] (Push Day) Bench Press: 3x5 @ 135lbs, felt strong
[Log 2] (Push Day) Bench Press: 3x5 @ 140lbs, PR!

RECENT CONVERSATION:
(no recent messages)

FITNESS KNOWLEDGE:
[KB 1] Progressive overload is key to strength gains. Increase weight, reps, or sets over time.
[KB 2] Bench press form: keep feet flat, arch back slightly, control the bar on the way down.
```

**Step 3: Generation**
FitAI generates:
> "Nice! I see you've been benching 135-140lbs and hit a PR recently 🔥 That's solid progress. To keep improving, focus on **progressive overload** - try adding 2.5-5lbs each week, or increase reps before increasing weight. Your form looks good based on your logs, but make sure you're controlling the bar on the way down and keeping your feet flat. Since you're training 4x a week, you could add a second bench day (maybe lighter weight, higher reps) to get more volume. Want me to help you plan a progression schedule?"

**Why this works:**
- ✅ References specific user history (135-140lbs, PR)
- ✅ Uses knowledge base for accuracy (progressive overload, form tips)
- ✅ Shows personality (🔥, "Nice!", "Want me to help...")
- ✅ Provides actionable advice (add 2.5-5lbs, second bench day)
- ✅ Acknowledges their pattern (4x per week)

---

## 🔄 Memory Accumulation

### How Summaries Grow Over Time

**Week 1:**
```
Summary: "User trained 3x/week, focus on strength, beginner level"
```

**Week 2:**
```
Summary 1: "User trained 3x/week, focus on strength, beginner level" (kept)
Summary 2: "User increased volume, added cardio, showing consistency" (new)
```

**Week 3:**
```
Summary 1: "User trained 3x/week, focus on strength, beginner level" (kept)
Summary 2: "User increased volume, added cardio, showing consistency" (kept)
Summary 3: "User switched to 4x/week, more advanced exercises, PRs on bench" (new)
```

**Result:** FitAI can see the full journey, not just the latest snapshot.

---

## 🎨 Key Design Principles

1. **Accumulation, Not Overwriting**
   - Memory summaries are never deleted or overwritten
   - Each summary represents a time window
   - Retrieval picks the most relevant summaries (top 5)

2. **Semantic Search Everywhere**
   - Training logs: semantic search (not just chronological)
   - Memory summaries: semantic search (not just recent)
   - Knowledge base: semantic search + reranking

3. **Multi-Layer Context**
   - Static (permanent) → Summaries (accumulated) → Logs (full history) → Session (conversation) → KB (knowledge)

4. **Performance First**
   - Pre-load context on login
   - Cache expensive operations
   - Only retrieve query-specific data per message

5. **Personality + Accuracy**
   - RAG provides accuracy (knowledge base)
   - Deep Memory provides personality (knows the user)
   - Together: accurate, personalized, warm responses

---

## 📈 Scaling Considerations

### Storage Growth (Per User, 1 Year Active)
- **Training logs:** ~200 logs (3 workouts/week × 52 weeks) = ~200KB
- **Memory summaries:** ~52 summaries (1 per week) = ~52KB
- **Chat messages:** ~500 messages (10 chats × 50 messages) = ~50KB
- **Total:** ~300KB per user

### Database Growth
- 1,000 users = ~300MB
- 10,000 users = ~3GB
- Scales linearly with user activity

### Query Performance
- Vector search with HNSW index: **<10ms** for top-5 retrieval
- Pre-loaded context: **<1ms** (in-memory cache)
- Total context assembly: **<50ms** (with pre-loading)

---

## 🎯 Summary

**RAG** = "What does the fitness knowledge base say?"
**Deep Memory** = "What do I know about this specific user?"

**Together** = FitAI that:
- Knows accurate fitness information (RAG)
- Remembers everything about you (Deep Memory)
- Combines both for personalized, contextually-aware coaching

The result: Users feel like FitAI truly knows them, remembers their journey, and provides advice that's both accurate and personally relevant.

