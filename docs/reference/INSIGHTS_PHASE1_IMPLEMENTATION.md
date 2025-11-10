# FitAI Workout Stats Phase 1 Implementation
## Data-Driven Stats for Consistency Feedback Loop

**Branch:** `feature/add-frontend`  
**Date:** November 2024  
**Status:** ✅ **COMPLETE** - Production Ready

---

## 🎯 Mission

Provide **data-driven workout stats** that create a consistency feedback loop. Users log workouts → see stats → chat with FitAI → feel motivated → log more workouts. Stats are analytical, factual, and actionable - not fluffy encouragement.

**Core Principle:** Hard stats and patterns that users can't track themselves, enabling FitAI to reference real data in conversations.

---

## 📋 Phase 1: Core Stats

### 1. **Consistency Metrics**
- Sessions this week/month
- Current streak (consecutive days)
- Weekly frequency (avg sessions/week)
- Best streak (all-time)
- Total sessions (all-time)

### 2. **Volume Metrics**
- Total volume this week/month (kg)
- Volume trend (% change vs previous week)
- Average session volume
- Volume by muscle group (push/pull/legs)

### 3. **Exercise Frequency**
- Top 5 exercises (with frequency counts)
- Exercise variety (unique exercises this month)
- Most/least trained muscle groups

### 4. **Recovery Metrics**
- Average recovery days (between sessions)
- Recovery trend (increasing/decreasing/stable)
- Days since last workout
- Rest days per week

### 5. **Progress Metrics**
- PRs this week/month
- Strength progression (% increase on top exercises)
- Plateau detection (exercises with no progress for 3+ weeks)

---

## 🏗️ API Implementation

### Endpoint: `GET /stats/{session_id}`

**Response Structure:**
```json
{
  "session_id": "abc-123",
  "stats": {
    "consistency": {
      "sessions_this_week": 5,
      "sessions_this_month": 18,
      "total_sessions": 45,
      "current_streak": 7,
      "weekly_frequency": 4.5,
      "best_streak": 14
    },
    "volume": {
      "total_volume_week": 12500.5,
      "total_volume_month": 45000.0,
      "volume_trend": "+15.2%",
      "avg_session_volume": 2500.0,
      "volume_by_group": {
        "push": 5000.0,
        "pull": 4000.0,
        "legs": 3500.0
      }
    },
    "exercises": {
      "top_5": [
        {"name": "Bench Press", "frequency": 6},
        {"name": "Squat", "frequency": 4},
        {"name": "Deadlift", "frequency": 3}
      ],
      "variety": 12,
      "most_trained_group": "push",
      "least_trained_group": "legs"
    },
    "recovery": {
      "avg_recovery_days": 1.8,
      "recovery_trend": "stable",
      "days_since_last": 1,
      "rest_days_per_week": 2.5
    },
    "progress": {
      "prs_this_week": 2,
      "prs_this_month": 5,
      "strength_progression": "+8.5%",
      "plateaus": [
        {"exercise": "Deadlift", "weeks": 3}
      ]
    }
  }
}
```

### Endpoint: `GET /workouts/calendar`

**Response Structure:**
```json
{
  "items": [
    {
      "session_id": "abc-123",
      "session_name": "Push Day",
      "session_type": "strength",
      "occurred_at": "2025-11-05T10:00:00Z",
      "duration_minutes": 75,
      "notes": "Felt strong today",
      "metadata": {}
    }
  ]
}
```

---

## 📱 Frontend Integration Guide (iOS/Android)

### Overview

The frontend should display:
1. **Interactive Calendar** - Visual workout history with intensity color coding
2. **Stats Dashboard** - Scrollable stats below calendar
3. **Quick Stats Cards** - Key metrics at a glance

---

## 🗓️ Interactive Calendar Implementation

### Design Requirements

**Calendar View:**
- Month view (default)
- Week view (optional)
- Day view (on tap)

**Color Grading by Intensity:**
- Calculate intensity from session volume
- Use volume from `/stats/{session_id}` endpoint
- Color scale: Light → Medium → Heavy → Very Heavy

### Intensity Calculation

```typescript
// Calculate intensity level for a workout session
function calculateIntensity(session: WorkoutSession, userStats: Stats): IntensityLevel {
  // Get session volume from stats endpoint
  const sessionVolume = getSessionVolume(session.session_id, userStats);
  
  // Compare to user's average session volume
  const avgVolume = userStats.stats.volume.avg_session_volume;
  
  if (sessionVolume === 0) return 'none';
  
  const ratio = sessionVolume / avgVolume;
  
  if (ratio < 0.5) return 'light';      // < 50% of average
  if (ratio < 0.8) return 'medium';    // 50-80% of average
  if (ratio < 1.2) return 'heavy';     // 80-120% of average
  return 'very_heavy';                  // > 120% of average
}
```

### Color Scheme (Recommended)

```typescript
const intensityColors = {
  none: '#E5E7EB',        // Gray - no workout
  light: '#93C5FD',       // Light blue - light intensity
  medium: '#60A5FA',      // Medium blue - medium intensity
  heavy: '#3B82F6',       // Blue - heavy intensity
  very_heavy: '#1D4ED8',  // Dark blue - very heavy intensity
  pr_day: '#10B981',      // Green - PR achieved (overlay)
  streak_day: '#F59E0B',  // Orange - part of streak (border)
};
```

### Calendar Component Structure

```typescript
// React Native / SwiftUI / Jetpack Compose example structure

<CalendarView>
  {/* Month Header */}
  <MonthHeader currentMonth={selectedMonth} />
  
  {/* Day Cells */}
  {days.map(day => {
    const workout = workoutsByDate[day.date];
    const intensity = workout ? calculateIntensity(workout, stats) : 'none';
    const hasPR = workout && checkIfPRDay(workout.session_id, stats);
    const isStreakDay = isPartOfStreak(day.date, stats);
    
    return (
      <DayCell
        date={day.date}
        intensity={intensity}
        hasPR={hasPR}
        isStreakDay={isStreakDay}
        onTap={() => navigateToWorkoutDetail(workout)}
      />
    );
  })}
</CalendarView>
```

### Day Cell Design

**Visual Elements:**
- **Background Color**: Based on intensity level
- **PR Badge**: Green dot/icon overlay if PR achieved
- **Streak Indicator**: Orange border if part of current streak
- **Day Number**: Visible text (white on dark colors, dark on light)
- **Tap Action**: Navigate to workout detail screen

**Example Day Cell States:**
```
┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐
│  1  │  │  2  │  │  3  │  │  4  │  │  5  │
│ 🔵  │  │ 🔵🔵│  │ 🔵🔵🔵│  │ 🔵🔵🔵🔵│  │ 🟢  │
│     │  │     │  │     │  │     │  │ PR  │
└─────┘  └─────┘  └─────┘  └─────┘  └─────┘
 Light   Medium    Heavy    Very      PR Day
                              Heavy
```

---

## 📊 Stats Dashboard Implementation

### Layout Structure

```
┌─────────────────────────────────┐
│   Interactive Calendar          │
│   (Month View)                  │
└─────────────────────────────────┘
           ↓ Scroll ↓
┌─────────────────────────────────┐
│   Quick Stats Cards              │
│   ┌──────┐ ┌──────┐ ┌──────┐   │
│   │ 5    │ │ 7 🔥 │ │ 2 🏆 │   │
│   │Week  │ │Streak│ │ PRs  │   │
│   └──────┘ └──────┘ └──────┘   │
└─────────────────────────────────┘
           ↓ Scroll ↓
┌─────────────────────────────────┐
│   Consistency Section            │
│   • Sessions this week: 5        │
│   • Sessions this month: 18      │
│   • Current streak: 7 days 🔥   │
│   • Weekly frequency: 4.5x       │
└─────────────────────────────────┘
           ↓ Scroll ↓
┌─────────────────────────────────┐
│   Volume Section                 │
│   • Total volume (week): 12,500kg│
│   • Volume trend: +15.2% 📈     │
│   • Avg session: 2,500kg        │
│   • Push: 5,000kg | Pull: 4,000kg│
│   • Legs: 3,500kg               │
└─────────────────────────────────┘
           ↓ Scroll ↓
┌─────────────────────────────────┐
│   Exercise Frequency             │
│   Top 5 Exercises:               │
│   1. Bench Press (6x)            │
│   2. Squat (4x)                  │
│   3. Deadlift (3x)               │
│   • Variety: 12 unique exercises │
│   • Most trained: Push           │
│   • Least trained: Legs          │
└─────────────────────────────────┘
           ↓ Scroll ↓
┌─────────────────────────────────┐
│   Recovery Section               │
│   • Avg recovery: 1.8 days       │
│   • Recovery trend: Stable       │
│   • Days since last: 1           │
│   • Rest days/week: 2.5          │
└─────────────────────────────────┘
           ↓ Scroll ↓
┌─────────────────────────────────┐
│   Progress Section               │
│   • PRs this week: 2 🏆          │
│   • PRs this month: 5            │
│   • Strength progression: +8.5%  │
│   • Plateaus:                    │
│     - Deadlift (3 weeks)         │
└─────────────────────────────────┘
```

### Quick Stats Cards (Top Section)

Display key metrics in card format:

```typescript
<QuickStatsRow>
  <StatCard
    value={stats.consistency.sessions_this_week}
    label="This Week"
    icon="📅"
  />
  <StatCard
    value={stats.consistency.current_streak}
    label="Streak"
    icon="🔥"
    highlight={stats.consistency.current_streak >= 7}
  />
  <StatCard
    value={stats.progress.prs_this_week}
    label="PRs"
    icon="🏆"
    highlight={stats.progress.prs_this_week > 0}
  />
</QuickStatsRow>
```

### Data Fetching Strategy

**On App Launch / Stats Screen Load:**
1. Fetch calendar data: `GET /workouts/calendar?start_date={month_start}&end_date={month_end}`
2. Fetch latest stats: `GET /stats/{most_recent_session_id}`
3. Cache calendar data (refresh daily)
4. Cache stats (refresh on new workout)

**On Workout Log:**
1. After logging workout, immediately fetch: `GET /stats/{new_session_id}`
2. Update calendar view
3. Show stats with animation

**On Calendar Month Change:**
1. Fetch calendar for new month: `GET /workouts/calendar?start_date={new_month_start}&end_date={new_month_end}`
2. Keep cached stats (still relevant)

---

## 🎨 UI/UX Recommendations

### Calendar Interactions

1. **Tap Day**: Navigate to workout detail screen
2. **Long Press Day**: Quick preview (workout name, duration, exercises count)
3. **Swipe Left/Right**: Change month
4. **Pinch/Zoom**: Switch between month/week view (optional)

### Stats Display

1. **Scrollable Sections**: Each stat category in its own section
2. **Expandable Cards**: Tap to see more details
3. **Visual Indicators**: 
   - 📈 for increasing trends
   - 📉 for decreasing trends
   - 🔥 for streaks
   - 🏆 for PRs
   - ⚠️ for plateaus/warnings

### Performance Optimization

1. **Lazy Loading**: Load calendar days as user scrolls
2. **Image Caching**: Cache workout icons/images
3. **Data Caching**: Cache stats for 5 minutes
4. **Background Refresh**: Refresh stats in background when app opens

---

## 🔗 Integration with FitAI Chat

Stats are automatically included in FitAI chat context. The chatbot can reference:

- "I saw you hit 2 PRs this week - that's huge!"
- "You've been consistent with 5 sessions this week - keep it up!"
- "Your recovery windows are getting shorter - how are you feeling?"
- "You've been skipping leg day - want to fix that?"

**No frontend changes needed** - stats are automatically available to FitAI via the backend context system.

---

## 📝 API Usage Examples

### Fetch Stats After Workout

```typescript
// After logging a workout
const logWorkout = async (workoutData) => {
  const response = await fetch('/log/workout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(workoutData)
  });
  
  const { session_id } = await response.json();
  
  // Immediately fetch stats
  const statsResponse = await fetch(`/stats/${session_id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const stats = await statsResponse.json();
  
  // Update UI with new stats
  updateStatsDisplay(stats.stats);
  updateCalendarView(session_id);
};
```

### Fetch Calendar for Month

```typescript
const fetchCalendar = async (month: Date) => {
  const startDate = new Date(month.getFullYear(), month.getMonth(), 1);
  const endDate = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  
  const response = await fetch(
    `/workouts/calendar?start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  const { items } = await response.json();
  
  // Group by date for calendar display
  const workoutsByDate = {};
  items.forEach(item => {
    const date = new Date(item.occurred_at).toDateString();
    workoutsByDate[date] = item;
  });
  
  return workoutsByDate;
};
```

### Calculate Intensity for Calendar

```typescript
const getIntensityForSession = async (sessionId: string, userStats: Stats) => {
  // Option 1: Use volume endpoint (recommended)
  const volumeResponse = await fetch(`/workouts/${sessionId}/volume`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const { volume_kg } = await volumeResponse.json();
  
  // Option 2: Calculate from session data (if you have exercise details)
  // const sessionVolume = calculateSessionVolume(session);
  
  const avgVolume = userStats.stats.volume.avg_session_volume;
  
  if (volume_kg === 0) return 'none';
  
  const ratio = volume_kg / avgVolume;
  
  if (ratio < 0.5) return 'light';
  if (ratio < 0.8) return 'medium';
  if (ratio < 1.2) return 'heavy';
  return 'very_heavy';
};
```

**Helper Endpoint:** `GET /workouts/{session_id}/volume` - Returns `{"session_id": "...", "volume_kg": 2500.5}`

---

## 🚀 Next Steps (Phase 2)

Future enhancements:
- Hidden stats (pattern detection, day preferences)
- Advanced analytics (periodization, volume distribution)
- Comparison views (this month vs last month)
- Goal tracking integration
- Export stats (CSV, PDF)

---

## 📚 References

- **Stats API**: `GET /stats/{session_id}` - `main.py::get_workout_stats()`
- **Calendar API**: `GET /workouts/calendar` - `main.py::get_workout_calendar()`
- **Stats Function**: `rag.py::get_workout_stats()`
- **Response Model**: `main.py::WorkoutStatsResponse`

---

## 🎯 Key Takeaways for Frontend

1. **Calendar is the hero** - Make it interactive and visually appealing
2. **Color code by intensity** - Use volume-based color grading
3. **Stats below calendar** - Scrollable, organized sections
4. **Quick stats at top** - Key metrics in cards
5. **Auto-refresh on workout** - Update immediately after logging
6. **Cache intelligently** - Reduce API calls, improve performance

The consistency feedback loop: **Log → See Stats → Chat with FitAI → Feel Motivated → Log More** 🚀
