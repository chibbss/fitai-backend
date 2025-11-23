`# FitAI API Documentation for Frontend Developers

**Last Updated:** November 18, 2025  
**Base URL:** `http://localhost:8000` (local) or `https://your-domain.com` (production)  
**Authentication:** JWT Bearer Token (from Supabase)

---

## 🔐 **Authentication**

All protected endpoints require a JWT token from Supabase in the Authorization header:

```javascript
headers: {
  'Authorization': `Bearer ${supabaseToken}`,
  'Content-Type': 'application/json'
}
```

### **Getting the Token**

After Supabase authentication:
```javascript
const { data: { session } } = await supabase.auth.getSession()
const token = session?.access_token
```

---

## 📋 **Table of Contents**

1. [Health & Status](#health--status)
2. [User Management](#user-management)
   - [GET /users/{user_id}](#get-usersuser_id)
   - [PUT /users/{user_id}](#put-usersuser_id)
   - [POST /users/{user_id}/preload-context](#post-usersuser_idpreload-context) (NEW - Context Pre-loading)
   - [PUT /users/{user_id}/discover](#put-usersuser_iddiscover) (NEW - Chat Discovery)
   - [POST /onboarding_step](#post-onboarding_step) (Progressive Onboarding)
   - [GET /onboarding/completion_message/{user_id}](#get-onboardingcompletion_messageuser_id) (Chat Handoff)
3. [Workout Logging (V2 - Structured)](#workout-logging-v2---structured)
4. [Workout Insights](#workout-insights)
5. [Workout Calendar](#workout-calendar)
6. [Weekly Summary](#weekly-summary) (NEW - Phase 1)
7. [Chat (AI Coach)](#chat-ai-coach)
8. [Chat Streaming](#chat-streaming)
9. [Training Logs (Legacy)](#training-logs-legacy)
10. [User Memories](#user-memories)

---

## 🏥 **Health & Status**

### **GET** `/health`

Check if API is running.

**Authentication:** None required

**Response:**
```json
{
  "status": "ok"
}
```

**Frontend Usage:**
```javascript
const checkHealth = async () => {
  const response = await fetch('http://localhost:8000/health')
  const data = await response.json()
  console.log(data.status) // "ok"
}
```

---

## 👤 **User Management**

### **GET** `/users/{user_id}`

Get user profile and goals.

**Authentication:** Required (user can only access their own profile)

**Response:**
```json
{
  "id": "user-123",
  "name": "John Doe",
  "email": "john@example.com",
  "profile": {
    "age": 28,
    "weight": 75,
    "height": 180,
    "gender": "male"
  },
  "goals": {
    "goal": "Build strength and muscle",
    "split": "Push/Pull/Legs",
    "target_weight": 80
  },
  "metadata": {},
  "created_at": "2025-10-28T10:00:00Z",
  "updated_at": "2025-10-28T10:00:00Z"
}
```

**Frontend Usage:**
```javascript
const getUser = async (userId, token) => {
  const response = await fetch(`http://localhost:8000/users/${userId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  return await response.json()
}
```

---

### **PUT** `/users/{user_id}`

Create or update user profile.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "profile": {
    "age": 28,
    "weight": 75,
    "height": 180,
    "gender": "male",
    "injuries": "Previous knee injury",
    "restrictions": "None",
    "motivation_notes": "Want to get stronger"
  },
  "goals": {
    "goal": "Build strength and muscle",
    "split": "Push/Pull/Legs",
    "target_weight": 80,
    "timeline": "6 months"
  },
  "metadata": {
    "signup_source": "web",
    "referral": "friend"
  }
}
```

**Response:** Same as GET `/users/{user_id}`

**Frontend Usage:**
```javascript
const updateUserProfile = async (userId, profileData, token) => {
  const response = await fetch(`http://localhost:8000/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(profileData)
  })
  return await response.json()
}

// Example: After onboarding
const profile = {
  name: "John Doe",
  profile: {
    age: 28,
    weight: 75,
    height: 180,
    gender: "male"
  },
  goals: {
    goal: "Build muscle",
    split: "PPL"
  }
}

await updateUserProfile(userId, profile, token)
```

---

### **POST** `/users/{user_id}/preload-context`

**⭐ NEW: Pre-load FitAI's memory on login for instant chat responses!**

Pre-load user context in the background when a user logs in. This makes FitAI "boot up" and remember the user before they start chatting, resulting in **much faster chat responses** (50-100ms vs 500-1000ms).

**Why this matters:**
- **Before:** Every chat request loads all context (user profile, memories, workout history, patterns) → slow
- **After:** Context is pre-loaded on login → chat requests are instant, only query-specific KB retrieval needed

**Authentication:** Required

**Response:**
```json
{
  "user_id": "user-123",
  "status": "preloading",
  "message": "FitAI is booting up and remembering you... Context will be ready shortly."
}
```

**What gets pre-loaded:**
- User profile/goals summary
- Long-term memory patterns
- Fitness overview stats
- User workout patterns
- Recent workout logs

**Frontend Usage:**
```javascript
const preloadContext = async (userId, token) => {
  const response = await fetch(`http://localhost:8000/users/${userId}/preload-context`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  return await response.json()
}

// Call this immediately after successful login
const handleLogin = async (email, password) => {
  // 1. Authenticate with Supabase
  const { data: { session }, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  
  if (error) {
    // Handle error
    return
  }
  
  const token = session.access_token
  const userId = session.user.id
  
  // 2. Pre-load FitAI context (runs in background, non-blocking)
  preloadContext(userId, token)
    .then(result => {
      console.log(result.message) // "FitAI is booting up..."
      // Context will be ready in ~1-2 seconds
    })
    .catch(err => {
      // Non-critical - chat will still work, just slower
      console.warn("Context pre-load failed:", err)
    })
  
  // 3. Navigate to main app
  router.replace("/(main)/chatscreen")
}
```

**💡 Best Practice:**
- Call this **immediately after login** (don't wait for response)
- It runs in the background, so it won't block navigation
- By the time the user opens the chat screen, FitAI already knows them!
- If pre-load fails, chat still works (just slower - falls back to on-demand loading)

**Cache Details:**
- Pre-loaded context is cached for **10 minutes**
- Cache is automatically invalidated when new workouts are logged
- No need to call this again during the same session

**Performance Impact:**
- **Without pre-load:** Chat response time: ~500-1000ms (loads all context)
- **With pre-load:** Chat response time: ~50-100ms (only KB retrieval needed)
- **Result:** Users feel like FitAI "thinks but not for long" ⚡

---

### **PUT** `/users/{user_id}/discover`

Store data discovered through chat conversations. This endpoint tracks what users naturally reveal during interactions, keeping it separate from explicit onboarding data.

**Authentication:** Required

**Use Cases:**
- User mentions weight in chat: "I weigh about 75kg"
- User reveals schedule constraints: "I can't train on Mondays"
- User shares current routine: "I'm running PPL"
- User mentions equipment: "I have dumbbells at home"

**Request Body:**
```json
{
  "field": "weight",
  "value": "75kg",
  "context": "User mentioned during workout discussion"
}
```

**Parameters:**
- `field` (string, required): The field name (e.g., "weight", "height", "constraints", "current_split", "equipment")
- `value` (any, required): The discovered value
- `context` (string, optional): Context of how it was discovered

**Response:** Same as GET `/users/{user_id}`, with discovered data in `metadata.discovered`

**Example Response:**
```json
{
  "id": "user-123",
  "name": "John Doe",
  "email": "john@example.com",
  "profile": {
    "age": 28,
    "experience_level": "1-2 years",
    "workout_preference": "Gym workouts"
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

**Frontend Usage:**
```javascript
const discoverUserData = async (userId, field, value, context, token) => {
  const response = await fetch(`http://localhost:8000/users/${userId}/discover`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ field, value, context })
  })
  return await response.json()
}

// Example: User mentions weight in chat
await discoverUserData(
  userId,
  "weight",
  "75kg",
  "User mentioned during workout discussion",
  token
)

// Example: User reveals schedule constraints
await discoverUserData(
  userId,
  "constraints",
  "Busy Mondays & Fridays",
  "Chat about weekly schedule",
  token
)
```

**Common Discovered Fields:**
- `weight`: User's current weight
- `height`: User's height
- `target_weight`: Goal weight
- `constraints`: Schedule or training constraints
- `current_split`: Current training split
- `equipment`: Available equipment
- `nutrition_preference`: Dietary approach

**💡 Pro Tip:** This creates a distinction between:
- **Onboarding data** (explicit, user-provided in forms) → stored in `profile` and `goals`
- **Discovered data** (organic, revealed in conversation) → stored in `metadata.discovered`

This helps fit.ai feel more natural and conversational!

---

### **POST** `/onboarding_step`

Capture each onboarding step incrementally. This allows for progressive onboarding where users fill in information screen-by-screen.

**Authentication:** Required

**⚠️ Important:** This endpoint works **without Modal services**. Onboarding only stores user data in the database. No AI/embeddings required.

**Supported Step Names:**
- `"why"` → Stores in `goals.primary_goal` (e.g., "build muscle", "lose fat")
- `"experience"` → Stores in `profile.experience_level` (e.g., "beginner", "intermediate", "advanced")
- `"training_style"` → Stores in `profile.workout_preference` (e.g., "strength training", "cardio", "home workouts")
- `"notes"` → Stores in `profile.constraints` (optional: e.g., "shoulder injury, gym 3x/week")

**Legacy Step Names (still supported):**
- `"basic"`, `"profile"` → Updates profile directly
- `"goals"`, `"preferences"` → Updates goals directly

**Request Body:**
```json
{
  "user_id": "user-123",
  "step": "why",
  "data": {
    "primary_goal": "Build muscle"
  }
}
```

**Parameters:**
- `user_id` (string, required): The user's ID
- `step` (string, required): The onboarding step name (see supported step names above)
- `data` (object, required): The data collected in this step

**Response:**
```json
{
  "user": {
    "id": "user-123",
    "name": null,
    "email": "user@example.com",
    "profile": {
      "experience_level": "1-2 years"
    },
    "goals": {
      "primary_goal": "Build muscle"
    },
    "metadata": {}
  }
}
```

**Request Examples:**

**Screen 1 - "Your Why" (Required):**
```json
{
  "user_id": "user-123",
  "step": "why",
  "data": {
    "primary_goal": "build muscle"
  }
}
```
*Alternative values:* `"lose fat"`, `"get consistent"`, `"feel healthier"`, `"train for performance"`

**Screen 2 - "Your Experience" (Required):**
```json
{
  "user_id": "user-123",
  "step": "experience",
  "data": {
    "experience_level": "beginner"
  }
}
```
*Alternative values:* `"intermediate"`, `"advanced"`

**Screen 3 - "How You Train" (Required):**
```json
{
  "user_id": "user-123",
  "step": "training_style",
  "data": {
    "workout_preference": "strength training"
  }
}
```
*Alternative values:* `"cardio"`, `"home workouts"`, `"sports & athletic"`, `"mix"`

**Screen 4 - "Anything I Should Know?" (Optional):**
```json
{
  "user_id": "user-123",
  "step": "notes",
  "data": {
    "constraints": "shoulder injury, gym 3x/week, prefer short workouts"
  }
}
```
*Note:* This screen is optional. If user skips, don't call the endpoint for this step.

**Frontend Usage:**
```javascript
const submitOnboardingStep = async (userId, step, data, token) => {
  const response = await fetch('http://localhost:8000/onboarding_step', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ user_id: userId, step, data })
  })
  return await response.json()
}

// Example: Screen 1 - Primary Goal (Your Why)
await submitOnboardingStep(
  userId,
  "why",
  { primary_goal: "build muscle" },
  token
)

// Example: Screen 2 - Experience Level
await submitOnboardingStep(
  userId,
  "experience",
  { experience_level: "beginner" },
  token
)

// Example: Screen 3 - Training Style (How You Train)
await submitOnboardingStep(
  userId,
  "training_style",
  { workout_preference: "strength training" },
  token
)

// Example: Screen 4 - Optional Notes/Constraints
await submitOnboardingStep(
  userId,
  "notes",
  { constraints: "shoulder injury, gym 3x/week" },
  token
)
```

**How It Works:**
- New step names: `"why"` → `goals.primary_goal`, `"experience"` → `profile.experience_level`, `"training_style"` → `profile.workout_preference`, `"notes"` → `profile.constraints`
- Legacy step names: `"goal"`, `"goals"`, `"preferences"` → updates `user.goals`; `"basic"`, `"profile"` → updates `user.profile`
- Each step is also logged as a training log entry for context

**💡 For Full Onboarding Flow:** See `ONBOARDING_GUIDE.md` for detailed 3-screen onboarding implementation.

---

### **GET** `/onboarding/completion_message/{user_id}`

Generate a personalized welcome message after onboarding completion. Use this for the chat handoff after users complete onboarding.

**Authentication:** Required

**Response:**
```json
{
  "message": "Hey there 👋 I remember what you told me — your goal is **build muscle**, you've got **beginner** experience, and you enjoy **strength training**. Want me to help plan your next session or log your last one?",
  "user_id": "user-123",
  "profile": {
    "experience_level": "beginner",
    "workout_preference": "strength training",
    "constraints": "shoulder injury, gym 3x/week"
  },
  "goals": {
    "primary_goal": "build muscle"
  }
}
```

**Frontend Usage:**
```javascript
const getCompletionMessage = async (userId, token) => {
  const response = await fetch(`http://localhost:8000/onboarding/completion_message/${userId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  return await response.json()
}

// After onboarding completes, fetch personalized message
const completion = await getCompletionMessage(userId, token)
// Display completion.message in chat UI as FitAI's first message
```

**Note:** The message automatically includes constraints/injuries if they were provided during onboarding.

---

## 🏋️ **Workout Logging (V2 - Structured)**

### **POST** `/log/workout`

Log a complete workout session with exercises, sets, reps, and weights.

**⭐ This is the MAIN endpoint for workout tracking!**

**Authentication:** Required

**⚠️ Important:** This endpoint works **without Modal services**. Workout logging uses Modal embeddings when available, but automatically falls back to local embeddings if Modal fails. This ensures all workouts are always searchable in chat ("never forgets" feature). The workout will always be logged successfully with embeddings.

**Request Body:**
```json
{
  "session_name": "Push Day",
  "session_type": "strength",
  "occurred_at": "2025-10-28T10:00:00Z",
  "duration_minutes": 60,
  "notes": "Felt strong today!",
  "exercises": [
    {
      "exercise_name": "Bench Press",
      "exercise_category": "chest",
      "sets": 3,
      "reps": [10, 10, 8],
      "weights": ["60kg", "60kg", "65kg"],
      "notes": "Last set was hard"
    },
    {
      "exercise_name": "Incline Dumbbell Press",
      "exercise_category": "chest",
      "sets": 3,
      "reps": [12, 10, 10],
      "weights": ["20kg", "20kg", "22.5kg"]
    },
    {
      "exercise_name": "Running",
      "exercise_category": "cardio",
      "duration_seconds": 1200,
      "distance_meters": 3000
    }
  ],
  "metadata": {
    "gym_location": "Home",
    "mood": "energetic"
  }
}
```

**Field Details:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_name` | string | No | E.g., "Push Day", "Morning Run" |
| `session_type` | string | No | E.g., "strength", "cardio", "flexibility" |
| `occurred_at` | ISO timestamp | No | Defaults to now |
| `duration_minutes` | number | No | Total workout duration |
| `notes` | string | No | Session notes |
| `exercises` | array | **Yes** | List of exercises (min 1) |

**Exercise Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `exercise_name` | string | **Yes** | Name of exercise |
| `exercise_category` | string | No | chest, legs, back, etc. |
| `sets` | number | No | Number of sets |
| `reps` | array[int] | No | Reps per set: [10, 10, 8] |
| `weights` | array[string] | No | Weight per set: ["60kg", "65kg", "BW"] |
| `duration_seconds` | number | No | For cardio/timed exercises |
| `distance_meters` | number | No | For running/cycling |
| `notes` | string | No | Exercise-specific notes |

**Response:**
```json
{
  "session_id": "abc-123-def",
  "exercise_count": 3,
  "inserted": true
}
```

**⚡ Save the `session_id` - you'll need it for insights!**

**Frontend Usage:**
```javascript
const logWorkout = async (workoutData, token) => {
  const response = await fetch('http://localhost:8000/log/workout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(workoutData)
  })
  
  const result = await response.json()
  return result.session_id // Save this!
}

// Example usage
const workout = {
  session_name: "Leg Day",
  session_type: "strength",
  exercises: [
    {
      exercise_name: "Squat",
      sets: 3,
      reps: [5, 5, 5],
      weights: ["100kg", "100kg", "100kg"]
    },
    {
      exercise_name: "Leg Press",
      sets: 3,
      reps: [12, 12, 10],
      weights: ["180kg", "180kg", "200kg"]
    }
  ]
}

const sessionId = await logWorkout(workout, token)
// Now fetch insights immediately!
```

---

## 💡 **Workout Insights**

### **GET** `/insights/{session_id}`

Get instant feedback on workout performance vs previous sessions.

**⭐ THIS IS THE WOW FACTOR - Show this immediately after logging!**

**Authentication:** Required

**URL Parameters:**
- `session_id` - The session_id from `/log/workout`

**Response:**
```json
{
  "session_id": "abc-123-def",
  "insights": [
    {
      "exercise": "Bench Press",
      "status": "progress",
      "message": "💪 Bench Press: Volume up 14.8% vs last session",
      "delta_pct": 14.8,
      "weight_increase": null
    },
    {
      "exercise": "Squat",
      "status": "pr",
      "message": "🏆 Squat: New weight PR! +5.0kg",
      "delta_pct": 8.5,
      "weight_increase": 5.0
    },
    {
      "exercise": "Deadlift",
      "status": "new",
      "message": "🎉 First time logging Deadlift!",
      "delta_pct": null,
      "weight_increase": null
    },
    {
      "exercise": "Pull-ups",
      "status": "regression",
      "message": "📉 Pull-ups: Volume down 12.3% - consider recovery",
      "delta_pct": -12.3,
      "weight_increase": null
    }
  ],
  "overall_message": "🔥 Outstanding progress! Volume significantly increased!",
  "avg_volume_change_pct": 12.5,
  "exercise_count": 4
}
```

**Insight Status Types:**
- `new` - First time logging this exercise
- `progress` - Volume increased
- `maintained` - Similar performance
- `regression` - Volume decreased
- `pr` - New weight personal record

**Frontend Usage:**
```javascript
const getInsights = async (sessionId, token) => {
  const response = await fetch(`http://localhost:8000/insights/${sessionId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  return await response.json()
}

// Complete flow: Log workout → Show insights
const handleWorkoutComplete = async (workoutData, token) => {
  // 1. Log workout
  const sessionId = await logWorkout(workoutData, token)
  
  // 2. Get insights immediately
  const insights = await getInsights(sessionId, token)
  
  // 3. Show celebration modal/animation
  showInsightsModal(insights)
  // Display: insights.overall_message
  // List: insights.insights (with emojis!)
}
```

**🎨 UI Recommendations:**
- Show insights as a full-screen modal or celebration screen
- Use emojis from the messages (they're already there!)
- Animate progress bars for `delta_pct`
- Highlight PRs with confetti animation
- Make it FEEL rewarding!

---

## 📅 **Workout Calendar**

### **GET** `/workouts/calendar`

Get workout session history for calendar display with enhanced fields for Phase 1.

**Authentication:** Required

**Query Parameters:**
- `start_date` (optional) - ISO timestamp, filter from this date
- `end_date` (optional) - ISO timestamp, filter to this date  
- `limit` (optional) - Max results (default: 100, max: 500)

**Response:**
```json
{
  "items": [
    {
      "session_id": "abc-123",
      "session_name": "Push Day",
      "session_type": "strength",
      "occurred_at": "2025-10-28T10:00:00Z",
      "duration_minutes": 60,
      "notes": "Felt strong today!",
      "metadata": {},
      "volume_kg": 2450.5,
      "exercise_count": 6,
      "has_pr": true,
      "muscle_groups": ["chest", "shoulders", "triceps"],
      "intensity_level": "heavy"
    },
    {
      "session_id": "def-456",
      "session_name": "Leg Day",
      "session_type": "strength",
      "occurred_at": "2025-10-26T11:00:00Z",
      "duration_minutes": 75,
      "notes": "Tough squats",
      "metadata": {},
      "volume_kg": 1800.0,
      "exercise_count": 5,
      "has_pr": false,
      "muscle_groups": ["legs"],
      "intensity_level": "medium"
    }
  ]
}
```

**Enhanced Fields (Phase 1):**
- `volume_kg` (float) - Total volume in kg for intensity coloring
- `exercise_count` (int) - Number of exercises in session
- `has_pr` (bool) - Whether session contains any personal records
- `muscle_groups` (List[str]) - Muscle groups trained (e.g., ["chest", "shoulders"])
- `intensity_level` (str) - "light" | "medium" | "heavy" | "very_heavy"

**Frontend Usage:**
```javascript
const getWorkoutCalendar = async (token, startDate = null, endDate = null) => {
  let url = 'http://localhost:8000/workouts/calendar?limit=30'
  
  if (startDate) {
    url += `&start_date=${startDate.toISOString()}`
  }
  if (endDate) {
    url += `&end_date=${endDate.toISOString()}`
  }
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  return await response.json()
}

// Get last 30 days
const calendar = await getWorkoutCalendar(token)

// Render calendar with enhanced fields
calendar.items.forEach(session => {
  // Add to calendar UI with intensity colors
  const intensityColor = getIntensityColor(session.intensity_level)
  addToCalendar(session.occurred_at, {
    name: session.session_name,
    volume: session.volume_kg,
    hasPR: session.has_pr,
    intensity: session.intensity_level,
    muscleGroups: session.muscle_groups
  })
})
```

---

### **GET** `/workouts/weekly-summary` (NEW - Phase 1)

Get 7 individual days (Mon-Sun) for horizontal scrolling strip. Apple Calendar style - swipe to see next/previous 7 days.

**Authentication:** Required

**Query Parameters:**
- `start_date` (optional) - ISO date for week start (Monday). Defaults to current week. Use this to navigate between weeks.

**Response:**
```json
{
  "days": [
    {
      "date": "2025-11-11T00:00:00Z",
      "day_name": "Mon",
      "day_number": 11,
      "has_workout": true,
      "session_id": "abc-123",
      "volume_kg": 2100.0,
      "intensity_level": "heavy",
      "has_pr": true,
      "exercise_count": 5
    },
    {
      "date": "2025-11-12T00:00:00Z",
      "day_name": "Tue",
      "day_number": 12,
      "has_workout": false,
      "session_id": null,
      "volume_kg": 0.0,
      "intensity_level": "light",
      "has_pr": false,
      "exercise_count": 0
    },
    {
      "date": "2025-11-13T00:00:00Z",
      "day_name": "Wed",
      "day_number": 13,
      "has_workout": true,
      "session_id": "def-456",
      "volume_kg": 800.0,
      "intensity_level": "light",
      "has_pr": false,
      "exercise_count": 3
    }
    // ... 4 more days (Thu, Fri, Sat, Sun)
  ],
  "week_start": "2025-11-11T00:00:00Z",
  "week_end": "2025-11-17T23:59:59Z",
  "is_current_week": true
}
```

**Frontend Usage:**
```javascript
// Initial load - current week
const getWeeklySummary = async (token, startDate = null) => {
  let url = 'http://localhost:8000/workouts/weekly-summary'
  if (startDate) {
    url += `?start_date=${startDate.toISOString()}`
  }
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  return await response.json()
}

// Load current week
const weekData = await getWeeklySummary(token)

// Render 7-day strip
weekData.days.forEach((day) => {
  renderDayCard({
    dayName: day.day_name,
    dayNumber: day.day_number,
    hasWorkout: day.has_workout,
    volume: day.volume_kg,
    intensity: day.intensity_level,
    hasPR: day.has_pr
  })
})

// Swipe LEFT → Next week
const nextWeekStart = new Date(weekData.week_end)
nextWeekStart.setDate(nextWeekStart.getDate() + 1)
const nextWeek = await getWeeklySummary(token, nextWeekStart)

// Swipe RIGHT → Previous week
const prevWeekStart = new Date(weekData.week_start)
prevWeekStart.setDate(prevWeekStart.getDate() - 7)
const prevWeek = await getWeeklySummary(token, prevWeekStart)
```

---

## 💬 **Chat (AI Coach)**

### **POST** `/chat`

Ask the AI coach questions. It has context of your workouts, profile, and fitness knowledge base.

**⚡ Performance Note:** If you called `/users/{user_id}/preload-context` on login, chat responses will be **much faster** (50-100ms vs 500-1000ms) because FitAI already has your context loaded!

**Authentication:** Required

**Request Body:**
```json
{
  "query": "How should I progress my bench press?",
  "session_id": "optional-conversation-id"
}
```

**Response:**
```json
{
  "answer": "Based on your last workout where you hit 65kg for 3x10, I'd recommend...",
  "references": [
    {
      "doc_id": "...",
      "chunk_id": "...",
      "score": 0.85,
      "metadata": {
        "source": "ACSM",
        "url": "https://..."
      },
      "snippet": "Progressive overload involves..."
    }
  ],
  "citations": [
    {
      "chunk_id": "...",
      "source": "ACSM"
    }
  ]
}
```

**Frontend Usage:**
```javascript
const askCoach = async (question, token, sessionId = null) => {
  const response = await fetch('http://localhost:8000/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: question,
      session_id: sessionId
    })
  })
  
  const data = await response.json()
  return data.answer
}

// Example
const answer = await askCoach(
  "What exercises should I do for chest?",
  token
)
console.log(answer) // AI response with context
```

**Session IDs:**
- Use the same `session_id` for continued conversations
- AI will remember context within that session
- Generate a new UUID for each new conversation

---

## 🌊 **Chat Streaming**

### **POST** `/chat_stream`

Same as `/chat` but streams tokens in real-time using Server-Sent Events (SSE).

**⭐ Use this for better UX - users see tokens appearing!**

**⚡ Performance Note:** If you called `/users/{user_id}/preload-context` on login, streaming will start **much faster** because FitAI already has your context loaded!

**Authentication:** Required

**Request Body:** Same as `/chat`

**Response Format (SSE Stream):**

```
event: metadata
data: {"references": [...], "citations": [...]}

event: token
data: "Based"

event: token
data: " on"

event: token
data: " your"

event: token
data: " last"

event: token
data: " workout"

event: done
data: {"answer": "Full answer here", "total_time_ms": 1234.5}
```

**Frontend Usage (EventSource API):**
```javascript
const askCoachStreaming = (question, token, onToken, onDone) => {
  const eventSource = new EventSource(
    'http://localhost:8000/chat_stream',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: question })
    }
  )
  
  let fullAnswer = ''
  
  eventSource.addEventListener('metadata', (e) => {
    const metadata = JSON.parse(e.data)
    // Store references for later
  })
  
  eventSource.addEventListener('token', (e) => {
    const token = JSON.parse(e.data)
    fullAnswer += token
    onToken(token) // Update UI with new token
  })
  
  eventSource.addEventListener('done', (e) => {
    const result = JSON.parse(e.data)
    eventSource.close()
    onDone(result)
  })
  
  eventSource.addEventListener('error', (e) => {
    console.error('Stream error:', e)
    eventSource.close()
  })
  
  return eventSource
}

// Usage with React
const [chatResponse, setChatResponse] = useState('')

askCoachStreaming(
  "How should I train?",
  token,
  (token) => {
    // Append each token to UI
    setChatResponse(prev => prev + token)
  },
  (result) => {
    console.log('Done!', result.total_time_ms)
  }
)
```

**Alternative: fetch with streaming**
```javascript
const response = await fetch('http://localhost:8000/chat_stream', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: question })
})

const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { value, done } = await reader.read()
  if (done) break
  
  const chunk = decoder.decode(value)
  // Parse SSE format and update UI
}
```

---

## 📝 **Training Logs (Legacy)**

### **POST** `/add_training_log`

Legacy endpoint for text-based training logs. Still supported but prefer `/log/workout` for workouts.

**Use this for:**
- Nutrition notes
- Recovery notes
- General observations
- Non-workout events

**Authentication:** Required

**Request Body:**
```json
{
  "user_id": "user-123",
  "notes": "Felt tired today, took a rest day",
  "kind": "recovery",
  "topic": "rest",
  "tags": ["recovery", "fatigue"],
  "occurred_at": "2025-10-28T10:00:00Z",
  "metadata": {
    "sleep_hours": 6
  }
}
```

**Response:**
```json
{
  "inserted": 1
}
```

---

## 🧠 **User Memories**

### **GET** `/memories/me`

Get user's long-term memory summaries (auto-generated from workout history).

**Authentication:** Required

**Response:**
```json
{
  "items": [
    {
      "id": "mem-123",
      "summary": "User prefers morning workouts, focuses on progressive overload...",
      "source": "auto_summary",
      "metadata": {
        "redacted": true
      },
      "updated_at": "2025-10-28T10:00:00Z"
    }
  ]
}
```

**Frontend Usage:**
```javascript
const getMemories = async (token) => {
  const response = await fetch('http://localhost:8000/memories/me', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  return await response.json()
}
```

---

## 🚨 **Error Handling**

All endpoints return standard HTTP status codes:

| Code | Meaning | Example Response |
|------|---------|------------------|
| 200 | Success | `{ "status": "ok" }` |
| 400 | Bad Request | `{ "detail": "Invalid input" }` |
| 401 | Unauthorized | `{ "detail": "Token expired" }` |
| 403 | Forbidden | `{ "detail": "Access denied" }` |
| 404 | Not Found | `{ "detail": "Session not found" }` |
| 413 | Request Too Large | `{ "detail": "Request too large" }` |
| 429 | Rate Limited | `{ "detail": "Too many requests" }` |
| 500 | Server Error | `{ "detail": "Internal error" }` |

**Frontend Error Handling:**
```javascript
const handleApiCall = async (apiFunction) => {
  try {
    const result = await apiFunction()
    return { success: true, data: result }
  } catch (error) {
    if (error.status === 401) {
      // Token expired - redirect to login
      redirectToLogin()
    } else if (error.status === 429) {
      // Rate limited - show retry message
      showMessage("Too many requests, please wait")
    } else {
      // Generic error
      showMessage("Something went wrong, please try again")
    }
    return { success: false, error }
  }
}
```

---

## 🔄 **Complete User Flow Example**

### **Login → Pre-load Context → Chat (Optimized Flow)**

```javascript
// 1. User logs in with Supabase
const { data: { session }, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})

if (error) {
  // Handle error
  return
}

const token = session.access_token
const userId = session.user.id

// 2. ⚡ Pre-load FitAI context (runs in background, non-blocking)
// This makes chat responses instant!
fetch(`http://localhost:8000/users/${userId}/preload-context`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
// Don't wait for response - it's non-blocking
// By the time user opens chat, FitAI already knows them!

// 3. Navigate to main app
router.replace("/(main)/chatscreen")
```

### **New User Onboarding → First Workout → Insights**

```javascript
// 1. User signs up with Supabase
const { user, session } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password'
})

const token = session.access_token
const userId = user.id

// 2. Create user profile
await fetch(`http://localhost:8000/users/${userId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: "John Doe",
    profile: {
      age: 28,
      weight: 75,
      height: 180
    },
    goals: {
      goal: "Build muscle",
      split: "Push/Pull/Legs"
    }
  })
})

// 3. ⚡ Pre-load context after profile creation
fetch(`http://localhost:8000/users/${userId}/preload-context`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})

// 3. Log first workout
const workout = {
  session_name: "First Workout - Push",
  exercises: [
    {
      exercise_name: "Bench Press",
      sets: 3,
      reps: [10, 10, 8],
      weights: ["60kg", "60kg", "65kg"]
    }
  ]
}

const sessionId = await logWorkout(workout, token)

// 4. Show insights (WOW moment!)
const insights = await getInsights(sessionId, token)
showCelebrationModal(insights)
// Message: "🎉 First time logging Bench Press!"

// 5. User asks coach a question
const answer = await askCoach(
  "How often should I train chest?",
  token
)
displayAnswer(answer)
```

---

## 📊 **Rate Limits**

| Endpoint | Limit | Notes |
|----------|-------|-------|
| `/chat` | 60/minute | Per user |
| `/chat_stream` | 60/minute | Per user |
| `/search` | 120/minute | Per user |
| `/log/workout` | 120/minute | Per user |
| `/add_training_log` | 120/minute | Per user |
| `/add_docs` | 30/minute | Admin only |

**Headers returned on rate limit:**
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1635724800
```

---

## 🎯 **Best Practices**

### **DO:**
✅ Store the JWT token securely (httpOnly cookie or secure storage)  
✅ Save `session_id` from `/log/workout` to fetch insights  
✅ Use `/chat_stream` for better UX (streaming tokens)  
✅ Show loading states during API calls  
✅ Handle errors gracefully with user-friendly messages  
✅ Use session IDs for continued conversations in chat  
✅ Validate inputs before sending to API  

### **DON'T:**
❌ Expose JWT token in URLs or localStorage (use httpOnly cookies)  
❌ Make API calls without error handling  
❌ Ignore rate limits (they're per user, not global)  
❌ Send massive requests (workouts >50 exercises)  
❌ Retry failed requests immediately (use exponential backoff)  

---

## 🧪 **Testing Locally**

### **Get a Test Token**

```bash
cd fitai-backend
source venv/bin/activate
python3 -c "from auth import create_test_token; print(create_test_token('test-user-1', 'premium'))"
```

### **Test with curl**

```bash
export TOKEN="your-token-here"

# Health check
curl http://localhost:8000/health

# Log workout
curl -X POST http://localhost:8000/log/workout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "session_name": "Test",
    "exercises": [
      {
        "exercise_name": "Squat",
        "sets": 3,
        "reps": [5, 5, 5],
        "weights": ["100kg", "100kg", "100kg"]
      }
    ]
  }'

# Get insights (use session_id from above)
curl http://localhost:8000/insights/SESSION_ID \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📞 **Need Help?**

- Backend issues: Check server logs at `fitai-backend/`
- Auth errors: Verify Supabase JWT secret matches
- 500 errors: Usually means missing data (e.g., user doesn't exist)
- Questions: Ask Emmanuel or check IMPLEMENTATION_SUMMARY.md

---

## 🚀 **Quick Start Checklist**

- [ ] Understand authentication flow (Supabase → JWT → API)
- [ ] **Call `/users/{user_id}/preload-context` on login** (for fast chat!)
- [ ] Test `/log/workout` endpoint (the most important one!)
- [ ] Implement insights display (the WOW factor)
- [ ] Test streaming chat (`/chat_stream`)
- [ ] Build calendar view (`/workouts/calendar`)
- [ ] Add error handling for all API calls
- [ ] Test with real Supabase tokens

**Focus on the core flow first:**
1. **User logs in → Call `/users/{user_id}/preload-context`** (FitAI boots up!)
2. User logs workout → `/log/workout`
3. Show insights immediately → `/insights/{session_id}`
4. User chats → `/chat` or `/chat_stream` (instant responses thanks to pre-load!)

**⚡ Performance Tip:** Always call preload-context after login. It makes FitAI feel lightning-fast!

Good luck! 💪

