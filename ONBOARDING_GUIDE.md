# FitAI Onboarding Flow – Frontend Blueprint (v3)

**Audience:** Mobile/frontend developer  
**Last Updated:** October 31, 2025  
**Backend Branch:** `cursor/enhance-rag-pipeline-with-search-and-reranking-2aea`

---

## 🎯 North Star

FitAI opens like a short cinematic sequence:
- Sign up → three quick taps → optional note → warm welcome → first chat remembers everything.  
- We capture just enough to personalize coaching, then keep discovering via conversation.  
- Voice stays warm, grounded, slightly cinematic.

---

## 🔐 Authentication First

1. **User signs up / logs in** via Supabase (or chosen auth).  
2. **Create base record** *(recommended)*:
   ```http
   PUT /users/{user_id}
   Authorization: Bearer {JWT}
   {
     "name": "Alex",
     "email": "alex@example.com"
   }
   ```
   Ensures the user exists before onboarding steps land.

---

## 📱 Onboarding Screens

### Screen 1 – “Your Why” *(Required)*
- **UI:** Buttons → Build muscle 💪 / Lose fat 🔥 / Get consistent 🧘 / Feel healthier ❤️ / Train for performance ⚡ / Other…
- **API:**
  ```http
  POST /onboarding_step
  {
    "user_id": "USER_ID",
    "step": "goals",
    "data": { "primary_goal": "build muscle" }
  }
  ```
- **Copy after tap:** “Got it. That’s your why. Every rep we log, every insight I give, will circle back to this.”

### Screen 2 – “Your Experience” *(Required)*
- **UI:** Beginner / Intermediate / Advanced.
- **API:**
  ```http
  POST /onboarding_step
  {
    "user_id": "USER_ID",
    "step": "profile",
    "data": { "experience_level": "beginner" }
  }
  ```
- **Copy:** “Perfect. I’ll tailor workouts and feedback that fit your level — not overwhelm you.”

### Screen 3 – “How You Train” *(Required)*
- **UI:** Strength training 🏋️ / Cardio 🏃‍♂️ / Home 🏠 / Sports ⚽ / Mix 🔁.
- **API:**
  ```http
  POST /onboarding_step
  {
    "user_id": "USER_ID",
    "step": "profile",
    "data": { "workout_preference": "strength training" }
  }
  ```
- **Copy:** “Nice — I’ll remember that. Training’s more sustainable when you enjoy it.”

### Screen 4 – “Anything I Should Know?” *(Optional)*
- **UI:** Free-text box (“Shoulder injury, gym 3×/week…”) + Skip.
- **API (if filled):**
  ```http
  POST /onboarding_step
  {
    "user_id": "USER_ID",
    "step": "profile",
    "data": { "constraints": "Shoulder injury, gym 3×/week" }
  }
  ```
- Alternative: store via `PUT /users/{id}/discover` if you’d rather flag it as discovered.
- **Copy:** “Thanks for telling me. I’ll keep that in mind when coaching you.”

### Final Screen – “Welcome to FitAI”
- **UI:** Single hero message + button (“Let’s go”).
- Optional completion flag:
  ```http
  PUT /users/{id}/discover
  {
    "field": "onboarding_completed",
    "value": true,
    "context": "User completed 3-step onboarding"
  }
  ```
- **Copy suggestion:** “🎉 You’re in. I’ll remember everything you shared — your goal, experience, and how you train.”

---

## 🔁 Data After Onboarding

| Field | Stored In | Source Screen |
|-------|-----------|---------------|
| `goals.primary_goal` | `user.goals` | Screen 1 |
| `profile.experience_level` | `user.profile` | Screen 2 |
| `profile.workout_preference` | `user.profile` | Screen 3 |
| `profile.constraints` (optional) | `user.profile` | Screen 4 |
| Discovery fields (weight, schedule, etc.) | `user.metadata.discovered` | Chat or optional screen |

Each `POST /onboarding_step` also writes a `training_logs` row (`kind = onboarding`, `topic = step`, `notes = ...`) so the RAG pipeline can surface the facts immediately.

---

## 🤝 First Chat Handoff

1. **Fetch user profile:** `GET /users/{user_id}` → returns `profile`, `goals`, `metadata`.
2. **Compose greeting (frontend logic):**
   ```text
   Hey there 👋 I remember what you told me — your goal is build muscle, you’ve got beginner experience, and you enjoy strength training. That’s a solid foundation.
   Want me to help plan your next session or log your last one?
   ```
3. **If constraints were provided:** add “I’ll keep your note about shoulder injury in mind so we train safely.”
4. **Offer quick actions:** buttons for “Plan next session”, “Log last workout”, “Explore/chat”.

Chat (`POST /chat` or `/chat_stream`) will automatically use these fields because `_summarize_user` in `rag.py` reads `profile`, `goals`, and `metadata.discovered`.

---

## 🧠 Backend Quick Reference

| Purpose | Endpoint | Notes |
|---------|----------|-------|
| Seed user after auth | `PUT /users/{user_id}` | Provide name/email metadata. |
| Onboarding steps | `POST /onboarding_step` | Steps: `goals`, `profile`, optional `profile`. |
| Discovered info | `PUT /users/{user_id}/discover` | Timestamped notes (injuries, schedule, etc.). |
| Fetch summary | `GET /users/{user_id}` | Used for chat handoff and profile screens. |
| Chat | `POST /chat` / `/chat_stream` | Personalized using onboarding data. |

---

## 🛠 Implementation Checklist

- [ ] After auth → call `PUT /users/{id}` once.
- [ ] Screen 1 → POST goals.
- [ ] Screen 2 → POST experience.
- [ ] Screen 3 → POST workout preference.
- [ ] Screen 4 (if filled) → POST constraints.
- [ ] Optional: mark `onboarding_completed` via `/users/{id}/discover`.
- [ ] Fetch user via `GET /users/{id}` and render the custom chat greeting.
- [ ] Provide quick-start actions on first chat screen.

---

## 📣 Copy & Tone Guidelines

- Always mirror the user’s words back (“You’re here to build muscle…”).
- Encourage without pressure (“I’ll keep it safe around that shoulder.”).
- Use warm emojis sparingly (💪, 🔥, 🤝) to reinforce tone.
- Optional screen’s skip button must feel guilt-free.

---

## 📊 Post-Onboarding KPIs

| Metric | Goal | Rationale |
|--------|------|-----------|
| Completion time | < 60 s | Keep friction minimal. |
| Required screens completed | > 90% | Required data only. |
| Optional screen completion | 30–60% | Shows it’s welcoming but not forced. |
| Workout logged within 24 h | > 50% | Confirms activation. |
| First chat within 48 h | > 30% | Ensures ongoing engagement. |

---

## 📝 Appendix – Sample Payloads

```json
// Screen 1 (goal)
{
  "user_id": "user-123",
  "step": "goals",
  "data": { "primary_goal": "build muscle" }
}

// Screen 2 (experience)
{
  "user_id": "user-123",
  "step": "profile",
  "data": { "experience_level": "beginner" }
}

// Screen 3 (preference)
{
  "user_id": "user-123",
  "step": "profile",
  "data": { "workout_preference": "strength" }
}

// Optional notes
{
  "user_id": "user-123",
  "step": "profile",
  "data": { "constraints": "Shoulder rehab, gym 3x/week" }
}

// Completion marker (optional)
{
  "field": "onboarding_completed",
  "value": true,
  "context": "User completed 3-step onboarding"
}
```

---

When this flow is wired in, FitAI greets the user like it’s been listening all along—exactly the “AI buddy who remembers you” experience we’re building.

