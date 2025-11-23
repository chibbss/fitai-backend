# FitAI Frontend Implementation Guide - Stats & Insights Visualization

**For:** Joshua (Frontend Engineer)  
**Last Updated:** November 19, 2025  
**Status:** 🚀 Ready for Implementation

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Available Data from Backend](#available-data-from-backend)
3. [Screen-by-Screen Implementation](#screen-by-screen-implementation)
4. [Component Specifications](#component-specifications)
5. [API Integration](#api-integration)
6. [Visual Design System](#visual-design-system)
7. [Implementation Checklist](#implementation-checklist)
8. [Priority Order](#priority-order)

---

## 🎯 Overview

This guide covers implementing the complete stats and insights visualization system for FitAI, including:

- **Weekly Summary Strip** (NEW - Priority 1)
- **PR Badges** (NEW - Priority 1)
- **Enhanced Calendar View** (Enhancement)
- **Workout Detail View** (NEW)
- **Insights Screen** (Enhancement)
- **Stats Dashboard** (Already exists, needs connection)

**Goal:** Create a beautiful, Apple Calendar-style experience that makes users want to track their workouts daily.

---

## 📊 Available Data from Backend

### ⚠️ **Important: Modal Services Requirements**

**Endpoints that work WITHOUT Modal (always available):**
- ✅ `POST /log/workout` - Workout logging (embeddings optional)
- ✅ `GET /workouts/calendar` - Calendar view
- ✅ `GET /workouts/weekly-summary` - Weekly strip
- ✅ `GET /workouts/{session_id}` - Workout details
- ✅ `PUT /workouts/{session_id}` - Edit workout
- ✅ `POST /onboarding_step` - Onboarding
- ✅ `GET /users/{user_id}` - User profile

**Endpoints that REQUIRE Modal (AI features):**
- ❌ `POST /chat` - AI chat (needs vLLM)
- ❌ `POST /chat_stream` - Streaming chat (needs vLLM)
- ❌ `GET /insights/{session_id}` - Workout insights (needs vLLM)
- ❌ `GET /onboarding/completion_message/{user_id}` - Welcome message (needs vLLM)

**Note:** Workout logging creates an optional embedding for semantic search in chat. If Modal is unavailable, the workout still logs successfully - it just won't be searchable in chat until Modal is deployed.

### 1. Calendar Data (`GET /workouts/calendar`)

**Endpoint:** `GET /workouts/calendar?start_date={ISO}&end_date={ISO}`

**Response:**
```typescript
{
  items: [
    {
      session_id: "abc-123",
      session_name: "Push Day",
      session_type: "strength",
      occurred_at: "2025-11-21T10:00:00Z",
      duration_minutes: 75,
      notes: "Felt strong today",
      volume_kg: 2.5,              // NEW - Total volume
      exercise_count: 4,            // NEW - Number of exercises
      has_pr: true,                 // NEW - PR detected
      muscle_groups: ["chest", "shoulders"], // NEW
      intensity_level: "heavy"      // NEW - light | medium | heavy | very_heavy
    }
  ]
}
```

### 2. Weekly Summary (`GET /workouts/weekly-summary`)

**Endpoint:** `GET /workouts/weekly-summary?start_date={ISO}` (optional, defaults to current week)

**Response:**
```typescript
{
  days: [
    {
      date: "2025-11-18",
      day_name: "Mon",
      day_number: 18,
      has_workout: true,
      session_id: "abc-123",
      volume_kg: 2.1,
      intensity_level: "heavy",
      has_pr: false,
      exercise_count: 5
    },
    // ... 6 more days (always 7, Mon-Sun)
  ],
  week_start: "2025-11-18",
  week_end: "2025-11-24",
  is_current_week: true
}
```

**Usage:**
- Initial load: `GET /workouts/weekly-summary` (current week)
- Swipe left (next week): `GET /workouts/weekly-summary?start_date=2025-11-25`
- Swipe right (previous week): `GET /workouts/weekly-summary?start_date=2025-11-11`

### 3. Workout Details (`GET /workouts/{session_id}`)

**Endpoint:** `GET /workouts/{session_id}`

**Response:**
```typescript
{
  session_id: "abc-123",
  session_name: "Push Day",
  session_type: "strength",
  occurred_at: "2025-11-21T10:00:00Z",
  duration_minutes: 75,
  notes: "Felt strong today",
  metadata: {},
  exercises: [
    {
      exercise_name: "Bench Press",
      exercise_category: "chest",
      sets: 3,
      reps: [8, 8, 6],
      weights: ["80kg", "80kg", "85kg"],
      notes: "Last set was hard"
    }
  ]
}
```

### 4. Workout Insights (`GET /insights/{session_id}`)

**Endpoint:** `GET /insights/{session_id}`

**Response:**
```typescript
{
  overall_message: "Great session! You hit 2 PRs and increased volume by 15%",
  exercise_count: 4,
  avg_volume_change_pct: 15.2,
  insights: [
    {
      exercise: "Squat",
      status: "pr",  // pr | progress | regression | maintained | new
      message: "New PR! You lifted 100kg, up from 95kg last week.",
      delta_pct: 12.5,
      weight_increase: 5.0
    }
  ]
}
```

### 5. Workout Stats (`GET /stats/{session_id}`)

**Endpoint:** `GET /stats/{session_id}`

**Response:** (See `INSIGHTS_PHASE1_IMPLEMENTATION.md` for full structure)

---

## 📱 Screen-by-Screen Implementation

### Screen 1: Calendar View (Enhanced)

**File:** `frontend/app/(main)/calendar.tsx`

**Current Status:** ✅ Structure exists, needs enhancements

**What to Add:**

1. **Weekly Summary Strip** (NEW - Above calendar)
2. **PR Badge Connection** (Use `has_pr` from API)
3. **Intensity Color Coding** (Use `intensity_level` from API)

**Layout:**
```
┌─────────────────────────────────────┐
│  ← Calendar And Stats          +    │  Header
├─────────────────────────────────────┤
│                                     │
│  ┌───────────────────────────────┐ │
│  │  ← Swipe → This Week          │ │  NEW: Weekly Strip
│  │  Mon Tue Wed Thu Fri Sat Sun  │ │
│  │  🔥  🔥  -   🏆  -   🔥  -    │ │
│  │  18  19  20  21  22  23  24   │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  November 2025          ←  →  │ │  Month Header
│  │  S  M  T  W  T  F  S          │ │
│  │     1  2  3  4  5  6          │ │
│  │  🔥  🔥  🏆  -   🔥  -   -    │ │  PR badges
│  └───────────────────────────────┘ │
│                                     │
│  [Quick Stats Cards - existing]    │
│  [Stats Sections - existing]        │
└─────────────────────────────────────┘
```

**Implementation Steps:**

1. Add `WeeklySummaryStrip` component above calendar
2. Fetch weekly summary on mount and on swipe
3. Connect PR badges to `has_pr` field
4. Use `intensity_level` for color coding

---

### Screen 2: Weekly Summary Strip Component (NEW)

**File:** `frontend/components/WeeklySummaryStrip.tsx` (NEW)

**Props:**
```typescript
interface WeeklySummaryStripProps {
  weekStartDate: string;  // ISO date for Monday
  onDayPress: (sessionId: string | null, date: string) => void;
  onSwipe: (direction: 'left' | 'right') => void;
}
```

**Visual Design:**
```
┌─────────────────────────────────────────────────────────┐
│  ← Swipe → This Week (Nov 18-24)                        │
│                                                          │
│  Mon        Tue        Wed        Thu        Fri        │
│  ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐ │
│  │  18  │   │  19  │   │  20  │   │  21  │   │  22  │ │
│  │ Pull │   │ Push │   │ Rest │   │ Legs │   │ Rest │ │
│  │ 🔥   │   │ 🔥   │   │  -   │   │ 🏆   │   │  -   │ │
│  │ 2.1kg│   │ 1.8kg│   │      │   │ 2.5kg│   │      │ │
│  └──────┘   └──────┘   └──────┘   └──────┘   └──────┘ │
│                                                          │
│  Sat        Sun                                          │
│  ┌──────┐   ┌──────┐                                    │
│  │  23  │   │  24  │                                    │
│  │ Arms │   │ Rest │                                    │
│  │ 🔥   │   │  -   │                                    │
│  │ 1.2kg│   │      │                                    │
│  └──────┘   └──────┘                                    │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Horizontal ScrollView (swipeable)
- Each day: 80-100px wide card
- Shows: date, workout name (if any), intensity emoji, volume, PR badge
- Swipe left → next week
- Swipe right → previous week
- Tap day → navigate to workout details

**Intensity Emoji Mapping:**
- `light` → 🔵
- `medium` → 🔵
- `heavy` → 🔥
- `very_heavy` → 🔥
- `has_pr === true` → 🏆 (overrides intensity emoji)

**Implementation:**
```typescript
import React, { useState, useEffect } from 'react';
import { ScrollView, View, TouchableOpacity, StyleSheet } from 'react-native';
import { workoutApi } from '@/utils/api';
import Typo from './Typo';
import { colors, spacingX } from '@/constants/theme';

const WeeklySummaryStrip: React.FC<WeeklySummaryStripProps> = ({
  weekStartDate,
  onDayPress,
  onSwipe,
}) => {
  const [weekData, setWeekData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWeekData(weekStartDate);
  }, [weekStartDate]);

  const fetchWeekData = async (startDate: string) => {
    setLoading(true);
    try {
      const data = await workoutApi.getWeeklySummary(startDate);
      setWeekData(data);
    } catch (error) {
      console.error('Failed to fetch weekly summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwipe = (direction: 'left' | 'right') => {
    const currentDate = new Date(weekStartDate);
    const daysToAdd = direction === 'left' ? 7 : -7;
    const newDate = new Date(currentDate.setDate(currentDate.getDate() + daysToAdd));
    onSwipe(direction);
    // Update weekStartDate in parent
  };

  if (loading) return <View><Typo>Loading...</Typo></View>;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScrollEndDrag={(e) => {
          // Detect swipe direction and call handleSwipe
        }}
      >
        {weekData?.days.map((day, index) => (
          <TouchableOpacity
            key={index}
            style={styles.dayCard}
            onPress={() => onDayPress(day.session_id, day.date)}
          >
            <Typo size={12} fontWeight="600">{day.day_name}</Typo>
            <Typo size={16} fontWeight="700">{day.day_number}</Typo>
            {day.has_workout ? (
              <>
                <Typo size={10} color={colors.neutral600}>
                  {day.session_name || 'Workout'}
                </Typo>
                <View style={styles.badgeContainer}>
                  {day.has_pr ? (
                    <Typo size={14}>🏆</Typo>
                  ) : (
                    <Typo size={14}>
                      {day.intensity_level === 'heavy' || day.intensity_level === 'very_heavy' ? '🔥' : '🔵'}
                    </Typo>
                  )}
                </View>
                <Typo size={10} color={colors.neutral500}>
                  {day.volume_kg.toFixed(1)}kg
                </Typo>
              </>
            ) : (
              <Typo size={12} color={colors.neutral400}>Rest</Typo>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacingX._15,
    paddingHorizontal: spacingX._20,
  },
  dayCard: {
    width: 80,
    height: 100,
    backgroundColor: colors.neutral50,
    borderRadius: 12,
    padding: spacingX._10,
    marginRight: spacingX._10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.neutral200,
  },
  badgeContainer: {
    marginVertical: spacingX._5,
  },
});

export default WeeklySummaryStrip;
```

---

### Screen 3: Workout Detail View (NEW)

**File:** `frontend/app/(main)/workout-detail.tsx` (NEW)

**When to Show:**
- User taps a day on calendar
- User taps a day on weekly strip
- User taps workout from insights screen

**Layout:**
```
┌─────────────────────────────────────┐
│  ← Thursday, Nov 21        ✏️       │  Header (edit button)
│  "Leg Day"                          │
├─────────────────────────────────────┤
│                                     │
│  ┌───────────────────────────────┐ │
│  │  🔥 INTENSITY: Heavy           │ │  Intensity Badge
│  │  💪 VOLUME: 2.5kg             │ │
│  │  🏆 PR DETECTED                │ │  (if has_pr)
│  │  🕒 DURATION: 75 mins          │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  Exercises (4)                 │ │
│  │  ──────────────────────────── │ │
│  │  • Squat 4×8 (100kg)         │ │
│  │  • Leg Press 3×12 (150kg)    │ │
│  │  • RDL 3×10 (80kg)           │ │
│  │  • Calf Raise 4×15 (60kg)    │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  Muscle Groups                │ │
│  │  [Legs] [Glutes] [Calves]    │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  Notes                         │ │
│  │  "Felt strong today, hit PR!" │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  FitAI Insight                │ │
│  │  "This was your heaviest leg   │ │
│  │   day this month! Volume up   │ │
│  │   15% from last week."        │ │
│  └───────────────────────────────┘ │
│                                     │
│  [Edit] [View Insights]            │  Action Buttons
└─────────────────────────────────────┘
```

**Implementation:**
- Fetch workout details: `GET /workouts/{session_id}`
- Fetch insights: `GET /insights/{session_id}` (optional, for insight section)
- Show all enhanced fields from calendar API
- Edit button → navigate to `/workout-log?sessionId={session_id}`

---

### Screen 4: Insights Screen (Enhancement)

**File:** `frontend/app/(main)/insights.tsx`

**Current Status:** ✅ Structure exists, needs visual polish

**Enhancements:**
1. Better visual hierarchy
2. PR badges more prominent
3. Add volume change visualization
4. Add muscle group breakdown

**Current Structure (Keep):**
- Overall message card (gradient)
- Exercise breakdown (individual insights)
- Average volume change card

**Enhancements to Add:**
- Better spacing and typography
- More prominent PR badges
- Visual indicators for trends (↑ ↓)
- Muscle group tags

---

### Screen 5: Stats Dashboard (Connection)

**File:** `frontend/app/(main)/calendar.tsx` (Stats section)

**Current Status:** ✅ Structure exists, needs API connection

**What to Connect:**
- Quick Stats Cards → Use `GET /stats/{session_id}`
- Stats Sections → Use same endpoint
- Ensure all fields are displayed correctly

---

## 🧩 Component Specifications

### 1. WeeklySummaryStrip.tsx (NEW)

**Location:** `frontend/components/WeeklySummaryStrip.tsx`

**Dependencies:**
- `workoutApi.getWeeklySummary()`
- React Native `ScrollView`, `TouchableOpacity`
- Theme: `colors`, `spacingX`

**Props:**
```typescript
interface WeeklySummaryStripProps {
  weekStartDate: string;
  onDayPress: (sessionId: string | null, date: string) => void;
  onSwipe: (direction: 'left' | 'right') => void;
}
```

**Features:**
- Horizontal scrollable
- 7 days (Mon-Sun)
- Swipe navigation
- Tap to view details

---

### 2. DayCell.tsx (Enhancement)

**Location:** `frontend/components/DayCell.tsx` (if exists) or create new

**Enhancements:**
- Use `has_pr` from calendar API → Show PR badge
- Use `intensity_level` from API → Color coding
- Use `volume_kg` for tooltip/hover (optional)

**Props:**
```typescript
interface DayCellProps {
  date: Date;
  workout?: {
    session_id: string;
    session_name?: string;
    volume_kg: number;
    intensity_level: string;
    has_pr: boolean;
    exercise_count: number;
  };
  onPress: () => void;
}
```

---

### 3. WorkoutDetailView.tsx (NEW)

**Location:** `frontend/app/(main)/workout-detail.tsx` or `frontend/components/WorkoutDetailView.tsx`

**Props:**
```typescript
interface WorkoutDetailViewProps {
  sessionId: string;
  onEdit: () => void;
  onViewInsights: () => void;
}
```

**Features:**
- Display all workout details
- Show enhanced fields (volume, intensity, PR, muscle groups)
- Show FitAI insight (optional)
- Edit button → navigate to edit screen

---

## 🔌 API Integration

### Add to `frontend/utils/api.ts`

```typescript
// Get weekly summary (7 days)
async getWeeklySummary(startDate?: string) {
  const token = await getAuthToken();
  if (!token) throw new Error('Authentication required');

  const url = startDate
    ? `${API_URL}/workouts/weekly-summary?start_date=${startDate}`
    : `${API_URL}/workouts/weekly-summary`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    if (response.status === 401) {
      Alert.alert('Session Expired', 'Please log in again.');
      router.replace('/login');
      throw new Error('Unauthorized');
    }
    throw new Error(errorData.detail || `HTTP ${response.status}`);
  }

  return await response.json();
},

// Get workout details (already exists, verify it works)
async getWorkoutDetails(sessionId: string) {
  // ... existing implementation
},

// Get insights (already exists, verify it works)
async getWorkoutInsights(sessionId: string) {
  // ... existing implementation
},
```

---

## 🎨 Visual Design System

### Color Coding

**Intensity Levels:**
```typescript
const intensityColors = {
  light: '#93C5FD',       // Light blue
  medium: '#60A5FA',      // Medium blue
  heavy: '#3B82F6',       // Blue
  very_heavy: '#1D4ED8',  // Dark blue
};
```

**Status Indicators:**
```typescript
const statusColors = {
  pr: '#10B981',          // Green (PR)
  progress: colors.primary, // Primary color (progress)
  regression: colors.rose,   // Red/Rose (regression)
  maintained: colors.neutral600, // Neutral (maintained)
  new: colors.primary,     // Blue (new exercise)
};
```

**Emoji Mapping:**
- `light` → 🔵
- `medium` → 🔵
- `heavy` → 🔥
- `very_heavy` → 🔥
- `has_pr === true` → 🏆 (overrides intensity)

---

## ✅ Implementation Checklist

### Priority 1: Weekly Summary Strip (2-3 days)

- [ ] Add `getWeeklySummary()` to `api.ts`
- [ ] Create `WeeklySummaryStrip.tsx` component
- [ ] Add to calendar screen (above calendar)
- [ ] Implement swipe navigation (left/right for next/previous week)
- [ ] Connect tap → workout details
- [ ] Test with real data

### Priority 2: PR Badges (1 day)

- [ ] Use `has_pr` from calendar API response
- [ ] Pass `has_pr` to DayCell component
- [ ] Display trophy icon (🏆) when `has_pr === true`
- [ ] Test with workouts that have PRs

### Priority 3: Enhanced Calendar Data (1 day)

- [ ] Use all new fields from calendar API:
  - `volume_kg`
  - `intensity_level`
  - `has_pr`
  - `exercise_count`
  - `muscle_groups`
- [ ] Display in calendar detail view
- [ ] Use `intensity_level` for color coding

### Priority 4: Workout Detail View (1-2 days)

- [ ] Create/enhance workout detail view component
- [ ] Show all enhanced fields
- [ ] Add FitAI insight section (optional, fetch from insights API)
- [ ] Connect edit button → navigate to edit screen
- [ ] Test navigation flow

### Priority 5: Polish & Testing (1 day)

- [ ] Visual polish (spacing, typography, colors)
- [ ] Animations (swipe transitions, tap feedback)
- [ ] Error handling (network errors, empty states)
- [ ] Loading states
- [ ] Test on iOS and Android

---

## 🚀 Priority Order

**Week 1 (Nov 19-24):**
1. ✅ Weekly Summary Strip
2. ✅ PR Badge Connection
3. ✅ Enhanced Calendar Data Display

**Week 2 (Nov 25-28):**
4. ✅ Workout Detail View
5. ✅ Insights Screen Enhancements
6. ✅ Final Polish & Testing

---

## 📚 Reference Files

- **API Documentation:** `docs/reference/API_DOCUMENTATION.md`
- **Stats Implementation:** `docs/reference/INSIGHTS_PHASE1_IMPLEMENTATION.md`
- **Backend Endpoints:**
  - `GET /workouts/calendar` - `main.py::get_workout_calendar()`
  - `GET /workouts/weekly-summary` - `main.py::get_weekly_summary()`
  - `GET /workouts/{session_id}` - `main.py::get_workout_details()`
  - `GET /insights/{session_id}` - `main.py::get_workout_insights()`
  - `GET /stats/{session_id}` - `main.py::get_workout_stats()`

---

## 🎯 Key Takeaways

1. **Weekly Strip is Priority 1** - This is the new hero feature
2. **PR Badges are Simple** - Just use `has_pr` from API
3. **All Data is Available** - Backend is ready, just connect it
4. **Apple Calendar Style** - Horizontal swipeable strip, clean design
5. **Test Early** - Use real data from backend to test

---

## 💬 Questions?

If you need clarification on:
- API endpoints → Check `API_DOCUMENTATION.md`
- Data structures → Check backend response models in `main.py`
- Design decisions → Reference this guide's visual mockups

**Good luck! 🚀**

