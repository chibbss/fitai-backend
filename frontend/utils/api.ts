import { supabase } from "./supabase";
import { Alert } from "react-native";
import { router } from "expo-router";
import { API_URL, MOCK_MODE } from './config';
import { Platform } from 'react-native';


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

    //get stats
    async getStats(sessionId: string) {
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

export const chatApi = {
    // Streaming chat with SSE
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

        return new Promise((resolve, reject) => {
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
                    onError(error);
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
            console.log('🤖 MOCK MODE: Skipping getCompletionMessage call');
            return null;
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