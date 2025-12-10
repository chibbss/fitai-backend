import { router } from "expo-router";
import { Alert } from "react-native";
import { API_URL, MOCK_MODE } from './config';
import { supabase } from "./supabase";


export const getAuthToken = async (): Promise<string | null> => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            Alert.alert(
                'Authentication Required',
                'Please log in to continue.',
                [{ text: 'OK', onPress: () => router.replace('/login') }]
            );
            return null;
        }
        return session.access_token;
    }
    catch (error) {
        console.error('Error getting auth token:', error);
        Alert.alert('Error', 'Failed to authenticate. Please try again.');
        return null;
    }
};

//Workout API calls
export const workoutApi = {
    //Log a workout
    async logWorkout(workoutData: any) {
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
                Alert.alert('Session Expired', 'Please log in again.');
                router.replace('/login');
                throw new Error('Unauthorized');
            }
            throw new Error(errorData.detail || `HTTP ${response.status}`);
        }
        return await response.json();
    },

    //Get workout insights
    async getInsights(sessionId: string) {
        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        //if MOCK_MODE is enabled, return mock data
        if (MOCK_MODE) {
            console.log('🤖 MOCK MODE: Using mock insights data');
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve({
                        session_id: sessionId,
                        insights: [
                            {
                                exercise: 'Bench Press',
                                status: 'pr',
                                message: 'Congratulations! You hit a new personal record with 100kg for 5 reps. This is a 5kg increase from your previous best.',
                                delta_pct: 12.5,
                                weight_increase: 5.0,
                            },
                            {
                                exercise: 'Squat',
                                status: 'progress',
                                message: 'Great progress! You increased your volume by 8% compared to your last session. Keep pushing!',
                                delta_pct: 8.2,
                                weight_increase: 2.5,
                            },
                            {
                                exercise: 'Deadlift',
                                status: 'progress',
                                message: 'Solid improvement! Your working sets showed consistent form and strength gains.',
                                delta_pct: 5.7,
                                weight_increase: null,
                            },
                            {
                                exercise: 'Pull-ups',
                                status: 'maintained',
                                message: 'You maintained your performance level. Consistency is key to long-term progress.',
                                delta_pct: 0.0,
                                weight_increase: null,
                            },
                            {
                                exercise: 'Overhead Press',
                                status: 'regression',
                                message: 'Slight decrease in volume this session. This could be due to fatigue or needing more recovery time.',
                                delta_pct: -3.2,
                                weight_increase: null,
                            },
                            {
                                exercise: 'Barbell Rows',
                                status: 'new',
                                message: 'You added a new exercise to your routine! This is a great addition for balanced muscle development.',
                                delta_pct: null,
                                weight_increase: null,
                            },
                            {
                                exercise: 'Leg Press',
                                status: 'progress',
                                message: 'Excellent volume increase! You\'re building strong foundations with progressive overload.',
                                delta_pct: 15.3,
                                weight_increase: 10.0,
                            },
                        ],
                        overall_message: 'Outstanding workout! You showed great progress across multiple exercises with 2 personal records.',
                        avg_volume_change_pct: 6.2,
                        exercise_count: 7,
                    })
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
            throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        return await response.json();
    },

    //get workout calendar
    async getCalendar(startDate?: string, endDate?: string, limit = 100) {
        // 🚨 Use mock if MOCK_MODE is enabled
        if (MOCK_MODE) {
            console.log('🤖 MOCK MODE: Using mock calendar data');
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

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        return await response.json();
    },

    //Get weekly summary
    async getWeeklySummary(startDate?: string) {
        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        let url = `${API_URL}/workouts/weekly-summary`;
        if (startDate) url += `?start_date=${startDate}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        return await response.json();
    },

    //Get workout details (for editing)
    async getWorkoutDetails(sessionId: string) {
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
                Alert.alert('Session Expired', 'Please log in again.');
                router.replace('/login');
                throw new Error('Unauthorized');
            }
            throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        return await response.json();
    },

    //Update workout
    async updateWorkout(sessionId: string, workoutData: any) {
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
                Alert.alert('Session Expired', 'Please log in again.');
                router.replace('/login');
                throw new Error('Unauthorized');
            }
            throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        return await response.json();
    },

    //get stats
    async getStats(sessionId: string) {
        // 🚨 Use mock if MOCK_MODE is enabled
        if (MOCK_MODE) {
            console.log('🤖 MOCK MODE: Using mock stats data');
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
                    });
                }, 300);
            });
        }

        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        try {
            const response = await fetch(`${API_URL}/stats/${sessionId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                //if endpoint is not found, return empty object
                if (response.status === 404) {
                    return null;
                }
                const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error: any) {
            // If endpoint doesn't exist, return null instead of throwing
            if (error.message?.includes('404') || error.message?.includes('Not Found')) {
                return null;
            }
            throw error;
        }
    },

    // Helper: Get session volume (will work once backend implements it)
    async getSessionVolume(sessionId: string) {
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

    async getWeeklySummary(startDate?: string) {
        // 🚨 Use mock if MOCK_MODE is enabled
        if (MOCK_MODE) {
            console.log('🤖 MOCK MODE: Using mock weekly summary data');
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Generate some sample weekly summary data
                    let weekStart: Date;
                    if (startDate) {
                        weekStart = new Date(startDate);
                    } else {
                        const today = new Date();
                        const day = today.getDay();
                        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                        weekStart = new Date(today.setDate(diff));
                    }

                    // Ensure it's Monday
                    const dayOfWeek = weekStart.getDay();
                    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                    weekStart.setDate(weekStart.getDate() + diffToMonday);
                    weekStart.setHours(0, 0, 0, 0);

                    // Calculate week end (Sunday)
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekStart.getDate() + 6);
                    weekEnd.setHours(23, 59, 59, 999);

                    // Check if this is the current week
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const isCurrentWeek = weekStart <= today && today <= weekEnd;

                    // Day names
                    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

                    // Workout types for variety
                    const workoutTypes = [
                        { name: 'Push Day', type: 'push' },
                        { name: 'Pull Day', type: 'pull' },
                        { name: 'Leg Day', type: 'legs' },
                        { name: 'Full Body', type: 'full_body' },
                        { name: 'Upper Body', type: 'upper' },
                        { name: 'Cardio', type: 'cardio' },
                    ];

                    // Generate 7 days of data
                    const days = [];
                    for (let i = 0; i < 7; i++) {
                        const currentDay = new Date(weekStart);
                        currentDay.setDate(weekStart.getDate() + i);

                        const dayName = dayNames[i];
                        const dayNumber = currentDay.getDate();
                        const dateStr = currentDay.toISOString().split('T')[0];

                        // Randomly assign workouts to 3-5 days of the week
                        // Skip Sunday (index 6) and maybe one other day for rest
                        const hasWorkout = i !== 6 && (i < 5 || Math.random() > 0.3);

                        if (hasWorkout) {
                            const workoutType = workoutTypes[Math.floor(Math.random() * workoutTypes.length)];
                            const intensityLevels: Array<'light' | 'medium' | 'heavy' | 'very_heavy'> = ['light', 'medium', 'heavy', 'very_heavy'];
                            const intensity = intensityLevels[Math.floor(Math.random() * intensityLevels.length)];
                            const hasPr = Math.random() > 0.7; // 30% chance of PR

                            // Set workout time to morning (8-10 AM)
                            const workoutTime = new Date(currentDay);
                            workoutTime.setHours(8 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);

                            days.push({
                                date: dateStr,
                                day_name: dayName,
                                day_number: dayNumber,
                                has_workout: true,
                                session_id: `mock-session-${dateStr}-${i}`,
                                session_name: workoutType.name,
                                volume_kg: 1500 + Math.floor(Math.random() * 3000), // 1.5kg to 4.5kg
                                intensity_level: intensity,
                                has_pr: hasPr,
                                exercise_count: 4 + Math.floor(Math.random() * 6), // 4-9 exercises
                            });
                        } else {
                            days.push({
                                date: dateStr,
                                day_name: dayName,
                                day_number: dayNumber,
                                has_workout: false,
                                session_id: null,
                                session_name: undefined,
                                volume_kg: 0,
                                intensity_level: null,
                                has_pr: false,
                                exercise_count: 0,
                            });
                        }
                    }

                    resolve({
                        days: days,
                        week_start: weekStart.toISOString().split('T')[0],
                        week_end: weekEnd.toISOString().split('T')[0],
                        is_current_week: isCurrentWeek,
                    });
                }, 300);
            });
        }


        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        let url = `${API_URL}/workouts/weekly-summary`;
        if (startDate) {
            url += `?start_date=${startDate}`;
        }

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
            }
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
    }
};

// 🚨 MOCK FUNCTIONS - Used when backend is unavailable
const mockChatStream = (
    query: string,
    sessionId: string | null,
    onToken: (token: string) => void,
    onDone: (answer: string, totalTime?: number) => void,
    onError: (error: Error) => void
): Promise<void> => {
    return new Promise((resolve) => {
        console.log('🤖 MOCK MODE: Simulating chat stream for query:', query);

        // Simulate realistic AI responses based on query keywords
        const responses: Record<string, string> = {
            'hello': 'Hello! How can I help you with your fitness journey today?',
            'hi': 'Hi there! Ready to work on your fitness goals?',
            'workout': 'I\'d be happy to help you with your workout! What type of exercise are you interested in?',
            'diet': 'Nutrition is a key part of fitness. What would you like to know about your diet?',
            'weight': 'Weight management is important. Are you looking to lose, maintain, or gain weight?',
            'cardio': 'Cardio exercises are great for heart health and burning calories. What kind of cardio are you thinking about?',
            'strength': 'Strength training builds muscle and increases metabolism. Are you new to lifting or experienced?',
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
                                    console.warn('Error processing SSE message:', e);
                                }
                            }
                            currentData = [];
                            currentEvent = 'message';
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('Error processing SSE progress:', error);
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
            console.warn('Error processing final SSE data:', error);
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
            
            // Don't retry on auth errors or bad requests
            if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
                throw lastError;
            }
            if (error.message?.includes('400') || error.message?.includes('Bad Request')) {
                throw lastError;
            }
            
            // Only retry on server errors (502/503/504) or network issues
            const isRetryable = 
                error.message?.includes('502') ||
                error.message?.includes('503') ||
                error.message?.includes('504') ||
                error.message?.includes('Network error') ||
                error.message?.includes('timeout') ||
                error.message?.includes('Streaming error');
            
            if (!isRetryable || attempt === maxRetries - 1) {
                throw lastError;
            }
            
            // Exponential backoff: 1s, 2s, 4s
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} after ${delay}ms (${error.message})`);
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
        // 🚨 Use mock if MOCK_MODE is enabled
        if (MOCK_MODE) {
            console.log('🤖 MOCK MODE: Using mock chat stream');
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
                                console.log('Chat metadata:', metadata);
                            } else if (event.event === 'done') {
                                // Done event: final answer
                                const doneData = JSON.parse(event.data);
                                const answer = doneData.answer || fullAnswer;
                                const totalTime = doneData.total_time_ms;
                                handleDone(answer, totalTime);
                            } else if (event.data) {
                                // Fallback: treat as token if no event type
                                try {
                                    const data = JSON.parse(event.data);
                                    const tokenStr = typeof data === 'string' ? data : String(data);
                                    if (tokenStr) {
                                        fullAnswer += tokenStr;
                                        onToken(tokenStr);
                                    }
                                } catch (e) {
                                    // If parsing fails, use data as-is
                                    if (event.data) {
                                        fullAnswer += event.data;
                                        onToken(event.data);
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('Failed to parse SSE message:', event, e);
                        }
                    },
                    onerror(err) {
                        console.error('SSE error:', err);
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
                console.error('Stream error:', error);
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
        // 🚨 Use mock if MOCK_MODE is enabled
        if (MOCK_MODE) {
            console.log('🤖 MOCK MODE: Using mock chat');
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
                Alert.alert('Session Expired', 'Please log in again.');
                router.replace('/login');
                throw new Error('Unauthorized');
            }
            throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        return await response.json();
    },
};

// User API calls
export const userApi = {
    // Get user profile
    async getUser(userId: string) {
        const token = await getAuthToken();
        if (!token) throw new Error('Authentication required');

        const response = await fetch(`${API_URL}/users/${userId}`, {
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

    // Discover user data (from chat conversations)
    async discoverData(field: string, value: any, context?: string) {
        // 🚨 MOCK MODE: Skip backend call
        if (MOCK_MODE) {
            console.log('🤖 MOCK MODE: Skipping discoverData call');
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
                    Alert.alert('Session Expired', 'Please log in again.');
                    router.replace('/login');
                    throw new Error('Unauthorized');
                }
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error: any) {
            console.error('Error discovering user data:', error);
            // Non-critical - don't throw, just log
            return null;
        }
    },

    // Get onboarding completion message
    async getCompletionMessage(userId: string) {
        // 🚨 MOCK MODE: Skip backend call
        if (MOCK_MODE) {
            console.log('🤖 MOCK MODE: Returning mock completion message');
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
                console.warn('Failed to get completion message:', errorData.detail);
                return null;
            }

            return await response.json();
        } catch (error: any) {
            console.warn('Error getting completion message:', error);
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
                    Alert.alert('Session Expired', 'Please log in again.');
                    router.replace('/login');
                    throw new Error('Unauthorized');
                }
                if (response.status === 404) {
                    return { items: [] }; // Return empty array if no memories
                }
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error: any) {
            console.error('Error getting memories:', error);
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
                    Alert.alert('Session Expired', 'Please log in again.');
                    router.replace('/login');
                    throw new Error('Unauthorized');
                }
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error: any) {
            console.error('Error adding training log:', error);
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
            throw new Error(errorData.detail || `HTTP ${response.status}`);
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
                console.log(`Discovered ${pattern.field}:`, match[1] || match[0]);
            } catch (error) {
                console.warn(`Failed to discover ${pattern.field}:`, error);
            }
        }
    }
};