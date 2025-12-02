# Frontend Updates: Post-Workout Engagement & Personalized Greetings

**Date:** December 2, 2025  
**For:** Joshua (Frontend Developer)  
**Purpose:** Brief overview of new features being added to improve chatbot engagement

---

## 🎯 What's Changing

Two new features are being added to make FitAI feel more personal and increase chatbot usage:

1. **Post-Workout Engagement** - Smart chat prompts after logging workouts
2. **Personalized Greetings** - Dynamic greetings based on workout patterns

**Good news:** These are functional enhancements, not UI redesigns. Your existing styling and components remain intact.

---

## 📁 Files Being Modified

### Files You're Working On (Minor Changes)

1. **`app/(main)/insights.tsx`**
   - **Change:** The "Chat with FitAI" button will now show context-aware labels
   - **Impact:** Button text changes (e.g., "🎉 Ask about my PR" instead of "Chat with FitAI")
   - **Your work:** Styling remains the same, just dynamic text

2. **`app/(main)/chatscreen.tsx`**
   - **Change:** Chat screen will accept pre-filled queries and show personalized greetings
   - **Impact:** New state management and conditional rendering
   - **Your work:** Existing UI components stay the same, just new logic

### New Files Being Added

3. **`utils/greetingUtils.ts`** (NEW)
   - Utility function for generating personalized greetings
   - You don't need to touch this

4. **`utils/api.ts`** (Minor addition)
   - Adding `getWeeklySummary()` method
   - No UI impact

---

## 🔍 Detailed Changes

### 1. Insights Screen (`insights.tsx`)

**What's happening:**
- After a workout is logged, the insights screen will analyze the workout
- If user hit a PR → Button shows "🎉 Ask about my PR"
- If user is consistent → Button shows "🔥 Chat about progress"
- Otherwise → Generic "Chat with FitAI"

**What you need to know:**
- Button styling stays the same (`styles.actionButton`, `styles.primaryButton`)
- Only the button text becomes dynamic
- Button now passes a pre-filled query to chat screen

**Code location:**
- Around line 242-250 (the "Chat with FitAI" button)
- New state: `chatPrompt` and helper function `generateChatPrompt()`

### 2. Chat Screen (`chatscreen.tsx`)

**What's happening:**
- Chat screen can now receive a `prefillQuery` parameter
- Personalized greeting replaces static greeting when chat is empty
- Greeting is based on workout patterns (PRs, consistency, etc.)

**What you need to know:**
- Existing `Greeting` component still works as fallback
- New personalized greeting uses similar styling
- Input field can be pre-filled with query

**Code location:**
- Around line 168-183 (initial message handling)
- New state: `personalizedGreeting`, `isLoadingGreeting`
- New conditional rendering for greeting (around line 807-824)

---

## 🎨 UI/UX Impact

### Minimal Visual Changes

✅ **What stays the same:**
- All existing styles and components
- Button layouts and positioning
- Color schemes and themes
- Overall screen structure

⚠️ **What changes:**
- Button text becomes dynamic (but same styling)
- Greeting message becomes dynamic (but same container styling)
- New prompt buttons may appear (styled similar to existing prompts)

### Styling Notes

The new personalized greeting will use:
- Similar container styling to existing `Greeting` component
- Same color scheme (`colors.primary`, `colors.neutral50`, etc.)
- Same spacing constants (`spacingX`, `spacingY`)
- Same typography component (`Typo`)

**You can polish these new elements using the same design system.**

---

## 🚀 What This Means for Your Work

### Continue Polishing As Normal

1. **Styling:** All your existing styles work. New elements use the same design tokens.
2. **Components:** No new component types, just dynamic content in existing components.
3. **Layout:** Screen layouts remain the same, just smarter content.

### Areas You Can Enhance

1. **Personalized Greeting Container**
   - Location: `chatscreen.tsx` → `personalizedGreetingContainer` style
   - Currently: Basic container with padding
   - Opportunity: Add animations, gradients, or visual polish

2. **Context-Aware Button Labels**
   - Location: `insights.tsx` → Button text
   - Currently: Simple text with emoji
   - Opportunity: Add icons, badges, or visual indicators

3. **Prompt Buttons**
   - Location: `chatscreen.tsx` → `promptButtons` style
   - Currently: Simple buttons with border
   - Opportunity: Match your design system, add hover/press states

---

## 📋 Implementation Checklist

When these changes are merged, you should:

- [ ] Review the new personalized greeting styling
- [ ] Check button label styling in insights screen
- [ ] Ensure prompt buttons match your design system
- [ ] Test responsive behavior on different screen sizes
- [ ] Verify dark mode compatibility (if applicable)
- [ ] Add any animations/transitions you want

---

## 🧪 Testing the Features

To see the new features in action:

1. **Post-Workout Engagement:**
   - Log a workout with a PR (personal record)
   - Go to insights screen
   - See the "🎉 Ask about my PR" button
   - Click it → Chat opens with pre-filled question

2. **Personalized Greetings:**
   - Open chat screen with no messages
   - See personalized greeting based on your workout patterns
   - Try different scenarios:
     - 0 workouts → "Welcome back!"
     - 4+ workouts → "You've been crushing it!"
     - Recent PR → "I noticed you hit a PR!"

---

## 💬 Questions?

If you have questions about:
- **Functionality:** Ask Emmanuel
- **Styling/Design:** Continue as normal, these are just content changes
- **Integration:** The changes are isolated and won't break existing work

---

## 📝 Summary

**TL;DR:**
- Two new features: smart chat prompts + personalized greetings
- Minimal UI changes: mostly dynamic text/content
- Your styling work continues as normal
- New elements use existing design system
- Opportunity to polish new greeting and button styles

**Bottom line:** These are functional enhancements that make FitAI smarter. Your UI polish work continues unaffected, and you can enhance the new elements using the same design system.

---

**Questions?** Reach out to Emmanuel or check the implementation PR for code details.

