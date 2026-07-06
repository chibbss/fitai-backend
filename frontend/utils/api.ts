import { cacheUserData, getCachedUserData, invalidateCache } from './dataCache';
import { router } from "expo-router";
import { Alert } from "react-native";
import { API_URL, MOCK_MODE } from './config';
import { supabase } from "./supabase";
import { alert } from './alert';
import { logger } from './logger';
import { isNetworkError, getNetworkErrorMessage } from './network';
import type {
    WorkoutData,
    LogWorkoutResponse,
    CalendarResponse,
    InsightsData,
    WorkoutStats,
    ApiError,
    WeeklySummary,
    UserProfile,
    OnboardingStep,
    OnboardingStepResponse,
} from '@/types/api';

/**
 * Helper function to refresh session token
 */
const refreshSessionToken = async (): Promise<boolean> => {
    try {
        const { data: { session }, error } = await supabase.auth.refreshSession();

        // Handle invalid refresh token
        if (error && (error.message?.includes('Invalid Refresh Token') ||
            error.message?.includes('refresh_token_not_found'))) {
            logger.log('[API] Invalid refresh token detected, clearing session');
            await supabase.auth.signOut().catch(() => {
                // Ignore signOut errors
            });
            return false;
        }

        if (error || !session) {
            logger.error('[API] Error refreshing session:', error);
            return false;
        }
        return true;
    } catch (error: any) {
        // Check if it's an invalid refresh token error
        if (error?.message?.includes('Invalid Refresh Token') ||
            error?.message?.includes('refresh_token_not_found')) {
            logger.log('[API] Invalid refresh token in catch, clearing session');
            await supabase.auth.signOut().catch(() => {
                // Ignore signOut errors
            });
        } else {
            logger.error('[API] Refresh session error:', error);
        }
        return false;
    }
};

/**
 * Helper function to create a user-friendly error from API response
 */
const createApiError = (error: any, defaultMessage: string = 'An error occurred. Please try again.'): Error => {
    // Check if it's a network error
    if (isNetworkError(error)) {
        return new Error(getNetworkErrorMessage(error, defaultMessage));
    }

    // Try to extract error message from response
    if (error?.detail && typeof error.detail === 'string') {
        return new Error(error.detail);
    }

    if (error?.message && typeof error.message === 'string') {
        // Check if error message itself is network-related
        if (isNetworkError(error.message)) {
            return new Error(getNetworkErrorMessage(error.message, defaultMessage));
        }
        return new Error(error.message);
    }

    // Fallback to default message
    return new Error(defaultMessage);
};

/**
 * Helper function to handle API errors with network detection
 */
const handleApiError = (error: any, response?: Response): never => {
    let errorMessage = 'An error occurred. Please try again.';

    // Check if it's a network error
    if (isNetworkError(error)) {
        errorMessage = getNetworkErrorMessage(error);
    } else if (response) {
        // Try to extract error from response
        // Note: This is async, but we'll handle it in the calling code
        errorMessage = `HTTP ${response.status}`;
    } else if (error?.message) {
        // Check if error message is network-related
        if (isNetworkError(error.message)) {
            errorMessage = getNetworkErrorMessage(error.message);
        } else {
            errorMessage = error.message;
        }
    }

    throw new Error(errorMessage);
};

/**
 * Helper function to handle 401 errors with token refresh and retry
 */
const handle401Error = async <T>(
    fetchFn: () => Promise<Response>
): Promise<T> => {
    try {
        const response = await fetchFn();

        if (response.status === 401) {
            // Try to refresh token
            const refreshed = await refreshSessionToken();
            if (refreshed) {
                // Retry the request with new token
                const retryResponse = await fetchFn();
                if (!retryResponse.ok) {
                    const errorData = await retryResponse.json().catch(() => ({ detail: 'Unknown error' }));
                    if (retryResponse.status === 401) {
                        // Still 401 after refresh, need to login again
                        if (__DEV__) {
                            alert.alert('Session Expired', 'Please log in again.');
                        }
                        router.replace('/login');
                        throw new Error('Unauthorized');
                    }
                    const error = createApiError(errorData, `HTTP ${retryResponse.status}`);
                    throw error;
                }
                return await retryResponse.json();
            } else {
                // Refresh failed, redirect to login
                if (__DEV__) {
                    alert.alert('Session Expired', 'Please log in again.');
                }
                router.replace('/login');
                throw new Error('Unauthorized');
            }
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            const error = createApiError(errorData, `HTTP ${response.status}`);
            throw error;
        }

        return await response.json();
    } catch (error: any) {
        // Re-throw if it's already an Error with proper message
        if (error instanceof Error) {
            throw error;
        }
        // Otherwise, create a proper error
        throw createApiError(error);
    }
};

export const getAuthToken = async (): Promise<string | null> => {
    // 🚨 MOCK MODE: Return dummy token
    if (MOCK_MODE) {
        console.log('🤖 MOCK MODE: getAuthToken returning mock-auth-token');
        return 'mock-auth-token';
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            // Less intrusive in production - only show alert in development
            if (__DEV__) {
                alert.alert(
                    'Authentication Required',
                    'Please log in to continue.',
                    [{ text: 'OK', onPress: () => router.replace('/login') }]
                );
            } else {
                // In production, silently redirect to login
                router.replace('/login');
            }
            return null;
        }
        return session.access_token;
    }
    catch (error) {
        logger.error('Error getting auth token:', error);
        // Less intrusive in production
        if (__DEV__) {
            alert.alert('Error', 'Failed to authenticate. Please try again.');
        }
        return null;
    }
};

//Workout API calls
export const workoutApi = {
    //Log a workout
    async logWorkout(workoutData: WorkoutData): Promise<LogWorkoutResponse> {
        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        const response = await fetch(`${API_URL}/log/workout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(workoutData),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            if (response.status === 401) {
                if (__DEV__) {
                    alert.alert('Session Expired', 'Please log in again.');
                }
                router.replace('/login');
                throw new Error('Unauthorized');
            }
            const error = createApiError(errorData, `HTTP ${response.status}`);
            throw error;
        }
        return await response.json();
    },

    //Get workout insights
    async getInsights(sessionId: string): Promise<InsightsData> {
        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        //if MOCK_MODE is enabled, return mock data
        if (MOCK_MODE) {
            logger.log('🤖 MOCK MODE: Using mock insights data');
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve({
                        session_id: sessionId,
                        insights: [
                            {
                                type: 'pr',
                                message: 'Congratulations! You hit a new personal record with 100kg for 5 reps. This is a 5kg increase from your previous best.',
                                weight_increase: 5.0,
                            },
                            {
                                type: 'progress',
                                message: 'Great progress! You increased your volume by 8% compared to your last session. Keep pushing!',
                                weight_increase: 2.5,
                            },
                            {
                                type: 'progress',
                                message: 'Solid improvement! Your working sets showed consistent form and strength gains.',
                                weight_increase: null,
                            },
                            {
                                type: 'maintained',
                                message: 'You maintained your performance level. Consistency is key to long-term progress.',
                                weight_increase: null,
                            },
                            {
                                type: 'regression',
                                message: 'Slight decrease in volume this session. This could be due to fatigue or needing more recovery time.',
                                weight_increase: null,
                            },
                            {
                                type: 'new',
                                message: 'You added a new exercise to your routine! This is a great addition for balanced muscle development.',
                                weight_increase: null,
                            },
                            {
                                type: 'progress',
                                message: 'Excellent volume increase! You\'re building strong foundations with progressive overload.',
                                weight_increase: 10.0,
                            },
                        ],
                        overall_message: 'Outstanding workout! You showed great progress across multiple exercises with 2 personal records.',
                        avg_volume_change_pct: 6.2,
                        exercise_count: 7,
                    } as InsightsData & { session_id: string; overall_message: string; avg_volume_change_pct: number; exercise_count: number })
                }, 800);
            });
        }

        const response = await fetch(`${API_URL}/insights/${sessionId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            const error = createApiError(errorData, `HTTP ${response.status}`);
            throw error;
        }

        return await response.json();
    },

    //get workout calendar
    async getCalendar(startDate?: string, endDate?: string, limit = 100) {
        // 🤖 Use mock if MOCK_MODE is enabled
        if (MOCK_MODE) {
            logger.log('🤖 MOCK MODE: Using mock calendar data');
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Generate some sample workout data for the current month
                    const now = new Date();
                    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
                    const end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);

                    const mockItems = [];
                    // Generate 3-5 sample workouts spread across the month
                    const numWorkouts = Math.floor(Math.random() * 3) + 3;
                    for (let i = 0; i < numWorkouts; i++) {
                        const daysDiff = Math.floor(Math.random() * (end.getTime() - start.getTime())) / (1000 * 60 * 60 * 24);
                        const workoutDate = new Date(start.getTime() + daysDiff * 24 * 60 * 60 * 1000);
                        workoutDate.setHours(10 + Math.floor(Math.random() * 8)); // Random time between 10 AM and 6 PM

                        const workoutTypes = ['Push', 'Pull', 'Legs', 'Full Body', 'Cardio'];
                        const workoutType = workoutTypes[Math.floor(Math.random() * workoutTypes.length)];

                        mockItems.push({
                            session_id: `mock-session-${i + 1}`,
                            session_name: `${workoutType} Workout`,
                            session_type: workoutType.toLowerCase(),
                            occurred_at: workoutDate.toISOString(),
                            duration_minutes: 45 + Math.floor(Math.random() * 45),
                            notes: `Mock ${workoutType} workout session`,
                            metadata: {},
                            volume_kg: 1000 + Math.floor(Math.random() * 5000),
                            exercise_count: 4 + Math.floor(Math.random() * 6),
                            has_pr: Math.random() > 0.7,
                            muscle_groups: workoutType === 'Push' ? ['chest', 'shoulders', 'triceps'] :
                                workoutType === 'Pull' ? ['back', 'biceps'] :
                                    workoutType === 'Legs' ? ['quads', 'hamstrings', 'glutes'] :
                                        ['full body'],
                            intensity_level: ['light', 'medium', 'heavy', 'very_heavy'][Math.floor(Math.random() * 4)] as any,
                        });
                    }

                    // Sort by date (most recent first)
                    mockItems.sort((a, b) => new Date(b.occurred_at!).getTime() - new Date(a.occurred_at!).getTime());

                    resolve({
                        items: mockItems,
                        total: mockItems.length,
                    });
                }, 300);
            })
        }

        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        let url = `${API_URL}/workouts/calendar?limit=${limit}`;
        if (startDate) url += `&start_date=${startDate}`;
        if (endDate) url += `&end_date=${endDate}`;

        const data = await handle401Error(() =>
            fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })
        );

        // Cache the result (get userId for caching)
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id;
            const cacheKey = `calendar_${startDate || 'default'}_${endDate || 'default'}_${limit}`;
            if (userId && cacheKey) {
                await cacheUserData(userId, cacheKey, data, 60 * 60 * 1000).catch(() => { }); // 1 hour cache
            }
        } catch (e) {
            // Cache failures shouldn't break the function
        }

        return data;
    },

    //Get weekly summary
    async getWeeklySummary(startDate?: string): Promise<WeeklySummary> {
        // 🤖 Use mock user ID in MOCK_MODE
        let userId = 'mock-user-id';
        if (!MOCK_MODE) {
            const { data: { session } } = await supabase.auth.getSession();
            userId = session?.user?.id || '';
        }
        const cacheKey = `weeklySummary_${startDate || 'current'}`;

        // Always fetch fresh data from backend (cache is handled by component)
        // This ensures data is always up-to-date, similar to calendar and insights
        return this.getWeeklySummaryFresh(startDate, userId, cacheKey);
    },

    // Helper method for fresh weekly summary fetch
    async getWeeklySummaryFresh(startDate?: string, userId?: string, cacheKey?: string): Promise<WeeklySummary> {
        // 🤖 Use mock if MOCK_MODE is enabled
        if (MOCK_MODE) {
            logger.log('🤖 MOCK_MODE: Generating mock weekly summary data');
            return new Promise((resolve) => {
                setTimeout(() => {
                    const start = startDate ? new Date(startDate) : new Date();
                    if (!startDate) {
                        // Get Monday of current week
                        const day = start.getDay();
                        const diff = start.getDate() - day + (day === 0 ? -6 : 1);
                        start.setDate(diff);
                    }

                    const days: any[] = [];
                    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

                    for (let i = 0; i < 7; i++) {
                        const d = new Date(start);
                        d.setDate(start.getDate() + i);
                        const hasWorkout = Math.random() > 0.4;

                        days.push({
                            date: d.toISOString().split('T')[0],
                            day_name: dayNames[i],
                            day_number: d.getDate(),
                            has_workout: hasWorkout,
                            session_id: hasWorkout ? `mock-session-weekly-${i}` : null,
                            session_name: hasWorkout ? ['Full Body', 'Push', 'Pull', 'Legs'][Math.floor(Math.random() * 4)] : undefined,
                            volume_kg: hasWorkout ? 2000 + Math.floor(Math.random() * 3000) : 0,
                            intensity_level: hasWorkout ? ['light', 'medium', 'heavy', 'very_heavy'][Math.floor(Math.random() * 4)] : null,
                            has_pr: hasWorkout && Math.random() > 0.8,
                            exercise_count: hasWorkout ? 4 + Math.floor(Math.random() * 4) : 0,
                        });
                    }

                    const weekEnd = new Date(start);
                    weekEnd.setDate(start.getDate() + 6);

                    resolve({
                        days,
                        week_start: start.toISOString().split('T')[0],
                        week_end: weekEnd.toISOString().split('T')[0],
                        is_current_week: !startDate || new Date(startDate).getTime() > new Date().getTime() - 7 * 24 * 60 * 60 * 1000,
                    } as WeeklySummary);
                }, 400);
            });
        }

        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        let url = `${API_URL}/workouts/weekly-summary`;
        if (startDate) url += `?start_date=${startDate}`;

        const data = await handle401Error<WeeklySummary>(() =>
            fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })
        );

        // Cache the result
        if (userId && cacheKey) {
            await cacheUserData(userId, cacheKey, data, 15 * 60 * 1000); // 15 minute cache
        }

        return data;
    },

    //Get workout details (for editing)
    async getWorkoutDetails(sessionId: string): Promise<WorkoutData & { session_id?: string; occurred_at?: string; duration_minutes?: number }> {
        // 🤖 MOCK_MODE support
        if (MOCK_MODE) {
            logger.log('🤖 MOCK_MODE: Returning mock workout details');
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve({
                        session_id: sessionId,
                        name: 'Mock Workout',
                        description: 'This is a mock workout session',
                        occurred_at: new Date().toISOString(),
                        duration_minutes: 60,
                        exercises: [
                            {
                                name: 'Bench Press',
                                notes: 'Warm up well',
                                sets: [
                                    { reps: 10, weight: 60, rpe: 7 },
                                    { reps: 8, weight: 80, rpe: 8 },
                                    { reps: 5, weight: 100, rpe: 9 },
                                ]
                            },
                            {
                                name: 'Squat',
                                notes: 'Focus on depth',
                                sets: [
                                    { reps: 10, weight: 80, rpe: 7 },
                                    { reps: 8, weight: 100, rpe: 8 },
                                    { reps: 5, weight: 120, rpe: 9 },
                                ]
                            }
                        ]
                    } as any);
                }, 400);
            });
        }

        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        const response = await fetch(`${API_URL}/workouts/${sessionId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            if (response.status === 401) {
                alert.alert('Session Expired', 'Please log in again.');
                router.replace('/login');
                throw new Error('Unauthorized');
            }
            const error = createApiError(errorData, `HTTP ${response.status}`);
            throw error;
        }

        const data = await response.json();
        return data as WorkoutData & { session_id?: string; occurred_at?: string; duration_minutes?: number };
    },

    //Update workout
    async updateWorkout(sessionId: string, workoutData: WorkoutData): Promise<LogWorkoutResponse> {
        // 🤖 MOCK_MODE support
        if (MOCK_MODE) {
            logger.log('🤖 MOCK_MODE: Simulating workout update success');
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve({
                        success: true,
                        session_id: sessionId,
                        message: 'Workout updated successfully (Mock)'
                    } as any);
                }, 300);
            });
        }

        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        const response = await fetch(`${API_URL}/workouts/${sessionId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(workoutData),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            if (response.status === 401) {
                alert.alert('Session Expired', 'Please log in again.');
                router.replace('/login');
                throw new Error('Unauthorized');
            }
            const error = createApiError(errorData, `HTTP ${response.status}`);
            throw error;
        }

        return await response.json();
    },

    //get stats
    async getStats(sessionId: string): Promise<WorkoutStats | null> {
        // 🤖 Use mock if MOCK_MODE is enabled
        if (MOCK_MODE) {
            logger.log('🤖 MOCK MODE: Using mock stats data');
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve({
                        session_id: sessionId,
                        stats: {
                            consistency: {
                                sessions_this_week: 3,
                                sessions_this_month: 12,
                                total_sessions: 45,
                                current_streak: 5,
                                weekly_frequency: 3.5,
                                best_streak: 12,
                            },
                            volume: {
                                total_volume_week: 8500,
                                total_volume_month: 32000,
                                volume_trend: '+15%',
                                avg_session_volume: 2800,
                                volume_by_group: {
                                    push: 12000,
                                    pull: 10000,
                                    legs: 10000,
                                },
                            },
                            exercises: {
                                top_5: [
                                    { name: 'Bench Press', frequency: 12 },
                                    { name: 'Squat', frequency: 10 },
                                    { name: 'Deadlift', frequency: 8 },
                                    { name: 'Pull-ups', frequency: 8 },
                                    { name: 'Overhead Press', frequency: 6 },
                                ],
                                variety: 18,
                                most_trained_group: 'Push',
                                least_trained_group: 'Legs',
                            },
                            recovery: {
                                avg_recovery_days: 1.5,
                                recovery_trend: 'Stable',
                                days_since_last: 1,
                                rest_days_per_week: 3,
                            },
                            progress: {
                                prs_this_week: 2,
                                prs_this_month: 5,
                                strength_progression: '+8%',
                                plateaus: [],
                            },
                        },
                    } as any); // Mock data has session_id and stats, but WorkoutStats type doesn't - cast to any
                }, 300);
            });
        }

        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        try {
            const data = await handle401Error<any>(() =>
                fetch(`${API_URL}/stats/${sessionId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                })
            ) as WorkoutStats;

            // Cache the result (get userId for caching)
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const userId = session?.user?.id;
                const cacheKey = `stats_${sessionId}`;
                if (userId && cacheKey) {
                    await cacheUserData(userId, cacheKey, data, 5 * 60 * 1000).catch(() => { }); // 5 minute cache
                }
            } catch (e) {
                // Cache failures shouldn't break the function
            }

            return data;
        } catch (error: any) {
            if (error?.message === 'Unauthorized') {
                throw error;
            }
            // If endpoint doesn't exist, return null instead of throwing
            const errorMsg = error?.message;
            if (errorMsg && typeof errorMsg === 'string' && (errorMsg.includes('404') || errorMsg.includes('Not Found'))) {
                return null;
            }
            throw error;
        }
    },

    // Helper: Get session volume (will work once backend implements it)
    async getSessionVolume(sessionId: string) {
        // 🤖 MOCK_MODE support
        if (MOCK_MODE) {
            return {
                session_id: sessionId,
                total_volume: 5000 + Math.floor(Math.random() * 5000)
            };
        }

        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        try {
            const response = await fetch(`${API_URL}/workouts/${sessionId}/volume`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error: any) {
            return null;
        }
    },
};

// =�ܿ MOCK FUNCTIONS - Used when backend is unavailable
const mockChatStream = (
    query: string,
    sessionId: string | null,
    onToken: (token: string) => void,
    onDone: (answer: string, totalTime?: number) => void,
    onError: (error: Error) => void
): Promise<void> => {
    return new Promise((resolve) => {
        logger.log('🤖 MOCK MODE: Simulating chat stream for query:', query);

        // Simulate a "thinking" delay of 2 seconds
        setTimeout(() => {
            // Simulate realistic AI responses based on query keywords
            const responses: Record<string, string> = {
                'hello':
                    "Hey 👋 Good to see you back. How’s your body feeling today — recovered or still sore from your last session?",

                'hi':
                    "Welcome back. Want to log today’s workout, review your progress, or adjust your plan?",

                'workout':
                    "Alright, let’s get to work. Are we focusing on upper body, lower body, or a full session today? Based on your recent activity, recovery matters — so tell me how you're feeling first.",

                'diet':
                    "Nutrition drives results. Are you aiming to improve performance, lose fat, or build muscle right now? Your intake should match your goal — let’s dial it in.",

                'Lets talk weight goals':
                    "Are you tracking weekly averages or just scale numbers? Sustainable progress comes from trends, not daily fluctuations.",

                'cardio':
                    "Cardio can improve endurance, recovery, and fat loss — depending on intensity. Are we doing steady-state or intervals today?",

                'strength':
                    "Strength training is about progressive overload and recovery. What movement are we working on? I can help structure your sets and reps."
            };

            // Find a matching response or use a default
            let responseText = 'I understand you\'re asking about "' + query + '". ';

            // Check for keywords
            const lowerQuery = query.toLowerCase();
            let matched = false;
            for (const [key, value] of Object.entries(responses)) {
                if (lowerQuery.includes(key)) {
                    responseText = value + ' ' + responseText.split(' ').slice(5).join(' ');
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                responseText = `That's a great question about "${query}"! While I'm in mock mode (backend is down), I can't provide real responses. However, I can help you plan workouts, track nutrition, and provide fitness guidance once the backend is back up. What specific aspect of fitness would you like to explore?`;
            }

            // Simulate streaming by sending tokens word by word with realistic delays
            const words = responseText.split(' ');
            let currentIndex = 0;
            let fullAnswer = '';

            const streamInterval = setInterval(() => {
                if (currentIndex < words.length) {
                    const token = words[currentIndex] + (currentIndex < words.length - 1 ? ' ' : '');
                    fullAnswer += token;
                    onToken(token);
                    currentIndex++;
                } else {
                    clearInterval(streamInterval);
                    // Small delay before calling onDone
                    setTimeout(() => {
                        onDone(fullAnswer.trim(), 1500);
                        resolve();
                    }, 100);
                }
            }, 50); // Simulate ~50ms per word (realistic streaming speed)
        }, 2000);
    });
};

// Chat API calls
const createReactNativeSSE = (
    url: string,
    options: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        onmessage: (event: { event: string; data: string }) => void;
        onerror: (error: any) => void;
        onclose: () => void;
    }
): () => void => {
    const { method = 'GET', headers = {}, body, onmessage, onerror, onclose } = options;

    const xhr = new XMLHttpRequest();
    let buffer = '';
    let currentEvent = 'message';
    let currentData: string[] = [];

    xhr.open(method, url, true);
    
    // Set headers
    Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
    });
    xhr.setRequestHeader('Accept', 'text/event-stream');

    // Handle progress - this is where we get streaming data in React Native
    xhr.onprogress = () => {
        try {
            // Get the response text so far
            const text = xhr.responseText;

            // Only process new data (everything after our buffer)
            if (text.length > buffer.length) {
                const newData = text.substring(buffer.length);
                buffer = text;

                // Process the new data line by line
                const lines = newData.split('\n');

                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        currentEvent = line.substring(6).trim();
                    } else if (line.startsWith('data:')) {
                        // Remove 'data:' prefix and add to current data array
                        currentData.push(line.substring(5));
                    } else if (line === '' || line === '\r') {
                        // Empty line indicates end of message
                        if (currentData.length > 0) {
                            const data = currentData.join('').trim();
                            if (data) {
                                try {
                                    onmessage({
                                        event: currentEvent,
                                        data: data,
                                    });
                                } catch (e) {
                                    logger.warn('Error processing SSE message:', e);
                                }
                            }
                            currentData = [];
                            currentEvent = 'message';
                        }
                    }
                }
            }
        } catch (error) {
            logger.warn('Error processing SSE progress:', error);
        }
    };

    xhr.onload = () => {
        try {
            // Process any remaining data
            if (currentData.length > 0) {
                const data = currentData.join('').trim();
                if (data) {
                    onmessage({
                        event: currentEvent,
                        data: data,
                    });
                }
            }
        } catch (error) {
            logger.warn('Error processing final SSE data:', error);
        }

        if (xhr.status >= 200 && xhr.status < 300) {
            onclose();
        } else {
            onerror(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
    };

    xhr.onerror = () => {
        onerror(new Error('Network error'));
    };

    xhr.onabort = () => {
        onclose();
    };

    // Send the request
    if (body) {
        xhr.send(body);
    } else {
        xhr.send();
    }

    // Return abort function
    return () => {
        xhr.abort();
    };
};

// ============================================================================
// RETRY UTILITY FOR MODAL COLD STARTS
// ============================================================================
// Added: Nov 26, 2025
// Purpose: Handle Modal vLLM cold starts (502/503 errors) with automatic retry
// How it works: Retries failed chat requests with exponential backoff (1s, 2s, 4s)
// Only retries on: 502, 503, 504, network errors, timeouts
// Does NOT retry on: 401 (auth), 400 (bad request)
// ============================================================================
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const retryWithBackoff = async <T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> => {
    let lastError: Error;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const errorMsg = error?.message;
            const errorMsgStr = errorMsg && typeof errorMsg === 'string' ? errorMsg : '';

            // Don't retry on auth errors or bad requests
            if (errorMsgStr.includes('401') || errorMsgStr.includes('Unauthorized')) {
                throw lastError;
            }
            if (errorMsgStr.includes('400') || errorMsgStr.includes('Bad Request')) {
                throw lastError;
            }

            // Only retry on server errors (502/503/504) or network issues
            const isRetryable =
                errorMsgStr.includes('502') ||
                errorMsgStr.includes('503') ||
                errorMsgStr.includes('504') ||
                errorMsgStr.includes('Network error') ||
                errorMsgStr.includes('timeout') ||
                errorMsgStr.includes('Streaming error');

            if (!isRetryable || attempt === maxRetries - 1) {
                throw lastError;
            }

            // Exponential backoff: 1s, 2s, 4s
            const delay = baseDelay * Math.pow(2, attempt);
            logger.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} after ${delay}ms (${errorMsgStr || 'Unknown error'})`);
            await sleep(delay);
        }
    }

    throw lastError!;
};

export const chatApi = {
    // Streaming chat with SSE
    // UPDATED: Added retry logic for Modal cold starts (Nov 26, 2025)
    async chatStream(
        query: string,
        sessionId: string | null,
        onToken: (token: string) => void,
        onDone: (answer: string, totalTime?: number) => void,
        onError: (error: Error) => void
    ): Promise<void> {
        // 🤖 Use mock if MOCK_MODE is enabled
        if (MOCK_MODE) {
            logger.log('🤖 MOCK MODE: Using mock chat stream');
            try {
                await mockChatStream(query, sessionId, onToken, onDone, onError);
            } catch (error: any) {
                onError(error instanceof Error ? error : new Error(String(error)));
            }
            return;
        }

        const token = await getAuthToken();
        if (!token) {
            onError(new Error('Authentication required'));
            return;
        }

        // Wrap chat stream in retry logic to handle Modal cold starts
        return retryWithBackoff(async () => {
            return new Promise<void>((resolve, reject) => {
                let fullAnswer = '';
                let isDone = false;
                let abortStream: (() => void) | null = null;

                const handleDone = (answer: string, totalTime?: number) => {
                    if (!isDone) {
                        isDone = true;
                        onDone(answer, totalTime);
                        resolve();
                    }
                };

                const handleError = (error: Error) => {
                    if (!isDone) {
                        isDone = true;
                        // Reject to trigger retry logic
                        reject(error);
                    }
                };

                try {
                    abortStream = createReactNativeSSE(`${API_URL}/chat_stream`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            query,
                            session_id: sessionId,
                        }),
                        onmessage(event) {
                            try {
                                if (event.event === 'token') {
                                    // Parse JSON-encoded token
                                    const token = JSON.parse(event.data);
                                    const tokenStr = typeof token === 'string' ? token : String(token);
                                    if (tokenStr) {
                                        fullAnswer += tokenStr;
                                        onToken(tokenStr);
                                    }
                                } else if (event.event === 'metadata') {
                                    // Metadata: references and citations
                                    const metadata = JSON.parse(event.data);
                                    logger.log('Chat metadata:', metadata);
                                } else if (event.event === 'done') {
                                    // Done event: final answer
                                    const doneData = JSON.parse(event.data);
                                    const answer = doneData.answer || fullAnswer;
                                    const totalTime = doneData.total_time_ms;
                                    handleDone(answer, totalTime);
                                } else if (event.event === 'error') {
                                    // Error event: stop streaming and notify
                                    try {
                                        const errorData = JSON.parse(event.data);
                                        const errorMsg = typeof errorData === 'string'
                                            ? errorData
                                            : (errorData.content || errorData.message || 'Streaming error');
                                        handleError(new Error(errorMsg));
                                    } catch (e) {
                                        handleError(new Error(event.data || 'Streaming error'));
                                    }
                                } else if (event.data && event.event === 'token' || !event.event || event.event === 'message') {
                                    // Fallback: treat as token if explicitly a token, or no event type (default 'message')
                                    try {
                                        const data = JSON.parse(event.data);
                                        const tokenStr = typeof data === 'string' ? data : String(data);
                                        if (tokenStr && typeof data === 'string') { // Only append if it's actually a string token
                                            fullAnswer += tokenStr;
                                            onToken(tokenStr);
                                        } else if (data && data.type === 'error') {
                                            // Catch-all for JSON-encoded error objects that leaked through
                                            handleError(new Error(data.content || 'Streaming error'));
                                        }
                                    } catch (e) {
                                        // If parsing fails, use data as-is only if we're reasonably sure it's a token
                                        if (event.data && (event.event === 'token' || !event.event)) {
                                            fullAnswer += event.data;
                                            onToken(event.data);
                                        }
                                    }
                                }
                            } catch (e) {
                                logger.warn('Failed to parse SSE message:', event, e);
                            }
                        },
                        onerror(err) {
                            logger.error('SSE error:', err);
                            handleError(new Error(err?.message || 'Streaming error occurred'));
                        },
                        onclose() {
                            // If we exit without 'done' event, use accumulated answer
                            if (!isDone) {
                                if (fullAnswer) {
                                    handleDone(fullAnswer);
                                } else {
                                    handleError(new Error('Stream closed without data'));
                                }
                            }
                        },
                    });
                } catch (error: any) {
                    logger.error('Stream error:', error);
                    handleError(error instanceof Error ? error : new Error(String(error)));
                }
            });
        }, 3, 1000).catch((error) => {
            // After all retries failed, notify user
            onError(error);
            throw error;
        });
    },

    // Fallback: Regular non-streaming chat
    async chat(query: string, sessionId: string | null) {
        // =�ܿ Use mock if MOCK_MODE is enabled
        if (MOCK_MODE) {
            logger.log('🤖 MOCK MODE: Using mock chat');
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve({
                        answer: `Mock response for: "${query}". Backend is currently in mock mode.`,
                        references: [],
                        citations: []
                    });
                }, 500);
            });
        }

        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query,
                session_id: sessionId,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            if (response.status === 401) {
                alert.alert(
                    'Authentication Required',
                    'Please log in to continue.',
                    [{ text: 'OK', onPress: () => router.replace('/login') }]
                );
                router.replace('/login');
                throw new Error('Unauthorized');
            }
            const error = createApiError(errorData, `HTTP ${response.status}`);
            throw error;
        }

        return await response.json();
    },

    // Get chat history from backend
    async getChatHistory(limit: number = 50, sessionId?: string): Promise<Array<{
        id: string;
        type: 'text' | 'voice';
        content: string;
        sender: 'user' | 'bot';
        timestamp?: number;
    }>> {
        // 🤖 Use mock if MOCK_MODE is enabled
        if (MOCK_MODE) {
            logger.log('🤖 MOCK MODE: Using mock chat history');
            return [];
        }

        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        let url = `${API_URL}/chat/history?limit=${limit}`;
        if (sessionId) url += `&session_id=${sessionId}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            if (response.status === 401) {
                alert.alert('Session Expired', 'Please log in again.');
                router.replace('/login');
                throw new Error('Unauthorized');
            }
            throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        const data = await response.json();

        // Transform backend format to frontend Message format
        const messages = (data.messages || []).map((msg: any) => ({
            id: msg.id || `${msg.created_at}_${Math.random()}`,
            type: 'text' as const,
            content: msg.content || '',
            sender: msg.role === 'user' ? 'user' : 'bot',
            timestamp: msg.created_at ? new Date(msg.created_at).getTime() : Date.now(),
        }));

        return messages;
    },
};

// User API calls
export const userApi = {
    // Get user profile
    async getUser(userId: string): Promise<UserProfile> {
        // Try cache first
        const cached = await getCachedUserData<UserProfile>(userId, 'userProfile');
        if (cached) {
            logger.log('[API] Using cached user profile');
            // Still fetch fresh data in background
            this.getUserFresh(userId).catch(err => {
                logger.warn('[API] Background user fetch failed:', err);
            });
            return cached;
        }

        // Fetch fresh
        return this.getUserFresh(userId);
    },

    // Helper method for fresh user fetch
    async getUserFresh(userId: string): Promise<UserProfile> {
        // 🚨 MOCK MODE: Return dummy profile
        if (MOCK_MODE) {
            logger.log('🤖 MOCK MODE: Returning dummy user profile');
            return {
                id: userId,
                email: 'mock@example.com',
                name: 'Mock User',
                profile: {
                    experience_level: 'intermediate',
                    workout_preference: 'gym'
                },
                goals: {
                    primary_goal: 'build muscle'
                },
                metadata: {},
                created_at: new Date().toISOString()
            };
        }

        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        const data = await handle401Error<UserProfile>(() =>
            fetch(`${API_URL}/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })
        );

        // Cache the result
        await cacheUserData(userId, 'userProfile', data, 24 * 60 * 60 * 1000); // 24 hour cache

        return data;
    },

    // Discover user data (from chat conversations)
    async discoverData(field: string, value: any, context?: string) {
        // 🤖 MOCK MODE: Skip backend call
        if (MOCK_MODE) {
            logger.log('🤖 MOCK MODE: Skipping discoverData call');
            return null;
        }
        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user?.id) {
                throw new Error('User ID not found');
            }

            const response = await fetch(`${API_URL}/users/${session.user.id}/discover`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    field,
                    value,
                    context,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
                if (response.status === 401) {
                    alert.alert('Session Expired', 'Please log in again.');
                    router.replace('/login');
                    throw new Error('Unauthorized');
                }
                const errorDetail = errorData?.detail;
                const errorMessage = (errorDetail && typeof errorDetail === 'string') ? errorDetail : `HTTP ${response.status}`;
                throw new Error(errorMessage);
            }

            return await response.json();
        } catch (error: any) {
            logger.error('Error discovering user data:', error);
            // Non-critical - don't throw, just log
            return null;
        }
    },

    // Get onboarding completion message
    async getCompletionMessage(userId: string) {
        // 🤖 MOCK MODE: Skip backend call
        if (MOCK_MODE) {
            logger.log('🤖 MOCK MODE: Returning mock completion message');
            return { message: "Hey! 👋 Welcome to FitAI! I'm excited to help you on your fitness journey. Based on what you shared during onboarding, I've got a personalized plan ready for you. What would you like to start with today?" };
        }
        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        try {
            const response = await fetch(`${API_URL}/onboarding/completion_message/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                // If endpoint fails, return null (non-critical)
                if (response.status === 404) {
                    return null;
                }
                const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
                logger.warn('Failed to get completion message:', errorData.detail);
                return null;
            }

            return await response.json();
        } catch (error: any) {
            logger.warn('Error getting completion message:', error);
            // Non-critical - return null if it fails
            return null;
        }
    },

    // Get user memories
    async getMemories() {
        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        try {
            const response = await fetch(`${API_URL}/memories/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
                if (response.status === 401) {
                    alert.alert('Session Expired', 'Please log in again.');
                    router.replace('/login');
                    throw new Error('Unauthorized');
                }
                if (response.status === 404) {
                    return { items: [] }; // Return empty array if no memories
                }
                const errorDetail = errorData?.detail;
                const errorMessage = (errorDetail && typeof errorDetail === 'string') ? errorDetail : `HTTP ${response.status}`;
                throw new Error(errorMessage);
            }

            return await response.json();
        } catch (error: any) {
            logger.error('Error getting memories:', error);
            return { items: [] }; // Return empty array on error
        }
    },
};

// Training log API (legacy)
export const trainingLogApi = {
    // Add training log (for non-workout events)
    async addTrainingLog(logData: {
        notes: string;
        kind?: string;
        topic?: string;
        tags?: string[];
        occurred_at?: string;
        metadata?: Record<string, any>;
    }) {
        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user?.id) {
                throw new Error('User ID not found');
            }

            const response = await fetch(`${API_URL}/add_training_log`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: session.user.id,
                    ...logData,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
                if (response.status === 401) {
                    alert.alert('Session Expired', 'Please log in again.');
                    router.replace('/login');
                    throw new Error('Unauthorized');
                }
                const errorDetail = errorData?.detail;
                const errorMessage = (errorDetail && typeof errorDetail === 'string') ? errorDetail : `HTTP ${response.status}`;
                throw new Error(errorMessage);
            }

            return await response.json();
        } catch (error: any) {
            logger.error('Error adding training log:', error);
            throw error;
        }
    },
};

//Bug Reporting API
export const bugApi = {
    async reportBug(bugData: {
        description: string;
        title?: string;
        severity?: string;
        metadata?: Record<string, any>;
    }) {
        // Get token if available (optional for bug reports)
        const token = await getAuthToken();

        const response = await fetch(`${API_URL}/bugs`, {
            method: 'POST',
            headers: {
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bugData),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            const error = createApiError(errorData, `HTTP ${response.status}`);
            throw error;
        }

        return await response.json();

    }
}

// Chat discovery: detects user info from messages
export const discoverFromChat = async (userMessage: string, botResponse: string) => {
    // Common patterns to detect user information
    const patterns = [
        {
            field: 'weight',
            regex: /(?:I (?:weigh|am|weight) (?:about |approximately )?)(\d+(?:\.\d+)?)\s*(?:kg|lbs?|pounds?)/i,
            context: 'User mentioned weight in chat',
        },
        {
            field: 'height',
            regex: /(?:I (?:am|measure) (?:about |approximately )?)(\d+(?:\.\d+)?)\s*(?:cm|feet|ft|inches?|in)/i,
            context: 'User mentioned height in chat',
        },
        {
            field: 'target_weight',
            regex: /(?:target|goal).*?(?:weight|weigh).*?(\d+(?:\.\d+)?)\s*(?:kg|lbs?|pounds?)/i,
            context: 'User mentioned target weight in chat',
        },
        {
            field: 'constraints',
            regex: /(?:can'?t|cannot|unable|busy|available).*?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekday|weekend)/i,
            context: 'User mentioned schedule constraints in chat',
        },
        {
            field: 'current_split',
            regex: /(?:I'?m (?:doing|running|following)|current (?:split|routine|program)).*?(?:PPL|push.*?pull.*?legs|upper.*?lower|full body|bro split)/i,
            context: 'User mentioned current training split in chat',
        },
        {
            field: 'equipment',
            regex: /(?:I have|I'?ve got|available).*?(?:dumbbells?|barbell|kettlebells?|resistance bands?|home gym|gym membership)/i,
            context: 'User mentioned available equipment in chat',
        },
    ];

    for (const pattern of patterns) {
        const match = userMessage.match(pattern.regex) || botResponse.match(pattern.regex);
        if (match) {
            try {
                await userApi.discoverData(
                    pattern.field,
                    match[1] || match[0], // Use captured group or full match
                    pattern.context
                );
                logger.log(`Discovered ${pattern.field}:`, match[1] || match[0]);
            } catch (error) {
                logger.warn(`Failed to discover ${pattern.field}:`, error);
            }
        }
    }
};
