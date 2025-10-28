# FitAI Onboarding Flow - Frontend Implementation Guide

**For:** Frontend Developer  
**Date:** October 28, 2025  
**Backend Branch:** `cursor/enhance-rag-pipeline-with-search-and-reranking-2aea`

---

## 🎯 Philosophy

**Onboarding = Get JUST enough to be helpful**  
**Everything else = Discover through conversation**

The goal is a **warm, frictionless, encouraging** 60-second onboarding that captures the minimum required data. Everything else (weight, detailed measurements, constraints) is discovered naturally through chat.

---

## 📱 The 3-Screen Onboarding Flow

### Screen 1: Primary Goal (Required)
**Time:** ~15 seconds  
**Purpose:** Understand what the user wants to achieve

#### UI Copy:
```
Welcome to fit.ai! 👋

I'm your AI fitness coach.
What brings you here?

○ Build muscle
○ Lose weight  
○ Get stronger
○ Stay active & healthy
○ Train for a sport
○ Just exploring

[Continue →]
```

#### API Call:
```http
POST /onboarding_step
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json

{
  "user_id": "user-123",
  "step": "goal",
  "data": {
    "primary_goal": "Build muscle"
  }
}
```

#### Response:
```json
{
  "user": {
    "id": "user-123",
    "name": null,
    "email": "user@example.com",
    "profile": {},
    "goals": {
      "primary_goal": "Build muscle"
    },
    "metadata": {}
  }
}
```

---

### Screen 2: Experience Level (Required)
**Time:** ~15 seconds  
**Purpose:** Tailor recommendations to skill level

#### UI Copy:
```
Cool! Building muscle 💪

How would you describe your
training experience?

○ Just starting out
○ Been training 6-12 months
○ Training 1-2 years
○ Experienced (2+ years)

[Continue →]
```

#### API Call:
```http
POST /onboarding_step
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json

{
  "user_id": "user-123",
  "step": "experience",
  "data": {
    "experience_level": "1-2 years"
  }
}
```

---

### Screen 3: Workout Preference (Required)
**Time:** ~15 seconds  
**Purpose:** Understand training environment

#### UI Copy:
```
Got it! What kind of workouts
do you prefer?

○ Gym workouts (weights & machines)
○ Home workouts (minimal equipment)
○ Bodyweight only
○ Mix of everything
○ Not sure yet

[Continue →]
```

#### API Call:
```http
POST /onboarding_step
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json

{
  "user_id": "user-123",
  "step": "preference",
  "data": {
    "workout_preference": "Gym workouts"
  }
}
```

---

### Screen 4: Optional Details (SKIPPABLE)
**Time:** ~15 seconds  
**Purpose:** Capture nice-to-have details WITHOUT being intimidating

#### UI Copy:
```
Almost there! A few quick details
(totally optional - skip any!)

Age: [___] ← Optional
Name: [___] ← Optional

Any injuries I should know about?
[Previous knee injury] ← Optional

Schedule preference?
○ Morning person
○ Evening workouts
○ Flexible

[Skip] or [Continue →]
```

**CRITICAL:** Make the "Skip" button prominent and guilt-free!

#### API Call (if user fills anything):
```http
POST /onboarding_step
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json

{
  "user_id": "user-123",
  "step": "details",
  "data": {
    "age": 28,
    "name": "John",
    "injuries": "Previous knee injury - fully recovered",
    "schedule_preference": "Morning person"
  }
}
```

**Note:** Only send fields the user actually filled in!

---

### Screen 5: Immediate Action (Call to Action)
**Time:** 0 seconds (just navigation)  
**Purpose:** Get user engaged immediately

#### UI Copy:
```
🎉 You're all set!

Ready to log your first workout?

[Log a workout now]
[Chat with coach first]
[I'll do it later]
```

**No API call** - just navigate based on selection.

---

## 🗂️ Data Structure

### What Goes Where

#### STATIC Data (Captured in Onboarding)
**Stored in:** `user.profile` and `user.goals`

**Required:**
- `goals.primary_goal` (Screen 1)
- `profile.experience_level` (Screen 2)
- `profile.workout_preference` (Screen 3)

**Optional:**
- `profile.age` (Screen 4)
- `profile.name` (Screen 4) - or from auth
- `profile.injuries` (Screen 4) - IMPORTANT for safety!
- `profile.schedule_preference` (Screen 4)

#### DISCOVERED Data (From Chat)
**Stored in:** `user.metadata.discovered`

This is for data the user naturally reveals during conversations, like:
- Weight: "I weigh about 75kg"
- Height: "I'm 180cm"
- Constraints: "I can't train Mondays"
- Current split: "I'm running PPL"
- Equipment: "I have dumbbells at home"

**Pattern:**
```json
{
  "metadata": {
    "discovered": {
      "weight": {
        "value": "75kg",
        "discovered_at": "2025-10-28T14:30:00Z",
        "context": "User mentioned during workout discussion"
      },
      "constraints": {
        "value": "Busy Mondays & Fridays",
        "discovered_at": "2025-10-28T15:00:00Z",
        "context": "Chat about weekly schedule"
      }
    }
  }
}
```

---

## 💬 Discovery During Chat

### Backend Endpoint: `PUT /users/{user_id}/discover`

When the AI coach discovers something about the user during chat, the frontend (or a future LLM tool) can call this endpoint to store it.

#### Example: User mentions weight in chat

**User message:** "I weigh about 75kg"

**API Call:**
```http
PUT /users/user-123/discover
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json

{
  "field": "weight",
  "value": "75kg",
  "context": "User mentioned during workout discussion"
}
```

**Response:**
```json
{
  "user": {
    "id": "user-123",
    "name": "John",
    "email": "user@example.com",
    "profile": {
      "experience_level": "1-2 years",
      "workout_preference": "Gym workouts",
      "age": 28
    },
    "goals": {
      "primary_goal": "Build muscle"
    },
    "metadata": {
      "discovered": {
        "weight": {
          "value": "75kg",
          "discovered_at": "2025-10-28T14:30:00Z",
          "context": "User mentioned during workout discussion"
        }
      }
    }
  }
}
```

---

## 🎨 FitAI Voice & Personality

### Tone Spectrum

**Situations & Responses:**

| Situation | fit.ai Response Style |
|-----------|---------------------|
| First workout logged | 🎉 Celebratory: "Hell yeah! Great start!" |
| PR achieved | 🔥 Hyped: "New PR! You crushed it!" |
| Plateau/struggle | 💪 Encouraging: "Progress isn't always linear - keep showing up!" |
| Injury concern | 🤲 Caring: "Let's dial it back and work around that." |
| Skipped workouts | 🤝 Understanding: "Life gets busy, I get it." |
| Technical questions | 🧠 Knowledgeable but friendly: "Based on your history..." |

### Examples

**❌ Generic/Clinical:**
> "Your workout volume increased 14.8% compared to previous session. Maintain progressive overload."

**✅ fit.ai Style:**
> "Hell yeah! 💪 You crushed it today - volume up 14.8% from last time. Your bench is climbing steadily. Keep this up and you'll hit that 80kg goal in no time."

---

**❌ Pushy:**
> "You haven't logged a workout in 5 days. You need to stay consistent."

**✅ fit.ai Style:**
> "Hey! Haven't seen you in the gym lately - life gets busy, I get it. Ready to jump back in? Even a quick 30-min session can get you back on track."

---

## 📊 Success Metrics

Track these to ensure onboarding is working:

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Completion time | <60 seconds | Friction = drop-off |
| Completion rate | >80% | Long forms kill sign-ups |
| Skip rate (screen 4) | 40-60% | Optional details shouldn't block |
| Workout logged within 24h | >50% | Immediate action = retention |
| Chat engagement within 48h | >30% | Discovery starts early |

---

## 🚀 Implementation Checklist

### Initial Sign-Up (After Auth)
```http
PUT /users/{user_id}
{
  "name": "John Doe",
  "email": "john@example.com",
  "metadata": {
    "onboarding_started": "2025-10-28T12:00:00Z",
    "onboarding_version": "v2"
  }
}
```

### Onboarding Screens (3-4 screens)
- [ ] Screen 1: Goal → `POST /onboarding_step` with `step: "goal"`
- [ ] Screen 2: Experience → `POST /onboarding_step` with `step: "experience"`
- [ ] Screen 3: Preference → `POST /onboarding_step` with `step: "preference"`
- [ ] Screen 4: Optional Details → `POST /onboarding_step` with `step: "details"` (SKIPPABLE)

### Post-Onboarding
- [ ] Show "Log workout" or "Chat with coach" CTA
- [ ] Track if user completes first workout within 24h
- [ ] Monitor chat engagement

---

## 🔗 Related Endpoints

### User Management
- `GET /users/{user_id}` - Get user profile
- `PUT /users/{user_id}` - Update user (full profile/goals)
- `PUT /users/{user_id}/discover` - Store discovered data from chat

### Onboarding
- `POST /onboarding_step` - Capture each onboarding screen

### Workout Logging
- `POST /log/workout` - Log structured workout
- `GET /workouts/calendar` - Get workout history
- `GET /insights/{session_id}` - Get instant insights after workout

### Chat
- `POST /chat` - Standard chat (returns full response)
- `POST /chat_stream` - Streaming chat (SSE)

---

## 💡 Pro Tips

1. **Keep it warm:** Use friendly copy, avoid clinical language
2. **Make skip obvious:** Don't guilt users for skipping optional details
3. **Show progress:** Use a simple "1 of 4" indicator
4. **Celebrate completion:** "You're all set! 🎉" feels rewarding
5. **Immediate action:** Get users logging or chatting ASAP
6. **Track drop-off:** If >20% abandon at a screen, it's too long/intimidating

---

## 📞 Questions?

- **Backend API:** See `API_DOCUMENTATION.md` for full endpoint details
- **Deployment:** See `DEPLOYMENT_GUIDE.md` for setup
- **Implementation Summary:** See `IMPLEMENTATION_SUMMARY.md` for technical context

---

**Remember:** The magic is in the warmth, not the data collection. Capture the minimum, discover the rest, and make every interaction feel like chatting with a knowledgeable friend. 🤝💪

