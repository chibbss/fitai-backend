// API Types

export interface UserProfile {
    id: string;
    name?: string | null;
    email?: string | null;
    profile: {
        experience_level?: string;
        workout_preference?: string;
        constraints?: string;
        [key: string]: any;
    };
    goals: {
        primary_goal?: string;
        [key: string]: any;
    };
    metadata: {
        [key: string]: any;
    };
    created_at?: string | null;
    updated_at?: string | null;
}

export interface WorkoutData {
    session_name?: string;
    session_type?: string;  // Add this
    duration_minutes?: number;  // Add this
    exercises: Array<{
        exercise_name: string;  // Changed from "name"
        exercise_category?: string;  // Add this
        sets?: number;  // Changed from array to integer
        reps?: number[];  // Flat array
        weights?: string[];  // Flat array
        duration_seconds?: number;
        notes?: string;
    }>;
    notes?: string;
}

export interface LogWorkoutResponse {
    session_id: string;
    message: string;
}

export interface CalendarResponse {
    [date: string]: {
        session_id: string;
        session_name?: string;
        volume_kg?: number;
        intensity_level?: string;
        has_pr?: boolean;
        exercise_count?: number;
    }[];
}

export interface InsightsData {
    insights: Array<{
        type: string;
        message: string;
        weight_increase?: number | null;
    }>;
}

export interface WorkoutStats {
    total_workouts: number;
    total_volume: number;
    average_volume: number;
    pr_count: number;
}

export interface ApiError {
    detail: string;
}

export interface WeeklySummary {
    days: Array<{
        date: string;
        day_name: string;
        day_number: number;
        has_workout: boolean;
        session_id: string | null;
        volume_kg: number;
        intensity_level: 'light' | 'medium' | 'heavy' | 'very_heavy';
        has_pr: boolean;
        exercise_count: number;
    }>;
    week_start: string;
    week_end: string;
    is_current_week: boolean;
}

export type OnboardingStep = 'intro' | 'goal' | 'experience' | 'preference' | 'details' | 'success' | 'why' | 'training_style' | 'notes';

export interface OnboardingStepResponse {
    user: UserProfile;
}
