import { supabase } from "./supabase";
import { Alert } from "react-native";
import { router } from "expo-router";

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

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