import { workoutApi } from './api';

export type IntensityLevel = 'none' | 'light' | 'medium' | 'heavy' | 'very_heavy';

export const intensityColors = {
    none: '#E5E7EB',        // Gray - no workout
    light: '#93C5FD',       // Light blue - light intensity
    medium: '#60A5FA',      // Medium blue - medium intensity
    heavy: '#3B82F6',       // Blue - heavy intensity
    very_heavy: '#1D4ED8',  // Dark blue - very heavy intensity
    pr_day: '#10B981',      // Green - PR achieved (overlay)
    streak_day: '#F59E0B',  // Orange - part of streak (border)
};

/**
 * Calculate intensity level for a workout session
 * Per INSIGHTS_PHASE1_IMPLEMENTATION.md spec
 */
export async function calculateIntensity(
    sessionId: string,
    avgSessionVolume: number
): Promise<IntensityLevel> {
    if (avgSessionVolume === 0) return 'none';

    // Try to get session volume from backend
    const volumeData = await workoutApi.getSessionVolume(sessionId);
    const sessionVolume = volumeData?.volume_kg || 0;

    if (sessionVolume === 0) return 'none';

    const ratio = sessionVolume / avgSessionVolume;

    if (ratio < 0.5) return 'light';      // < 50% of average
    if (ratio < 0.8) return 'medium';     // 50-80% of average
    if (ratio < 1.2) return 'heavy';      // 80-120% of average
    return 'very_heavy';                  // > 120% of average
}

/**
 * Calculate volume from exercise data (fallback if backend endpoint unavailable)
 */
export function calculateVolumeFromExercise(exercise: {
    sets?: number;
    reps?: number[];
    weights?: string[];
}): number {
    if (!exercise.sets || !exercise.reps || !exercise.weights) {
        return 0;
    }

    let volume = 0;
    for (let i = 0; i < Math.min(exercise.sets, exercise.reps.length, exercise.weights.length); i++) {
        const reps = exercise.reps[i] || 0;
        const weightStr = exercise.weights[i] || '0';
        
        // Parse weight (handle "45kg", "135lbs", "BW", etc.)
        let weight = 0;
        if (weightStr.toLowerCase() === 'bw' || weightStr.toLowerCase() === 'bodyweight') {
            weight = 75; // Assume 75kg bodyweight
        } else {
            const match = weightStr.match(/[\d.]+/);
            weight = match ? parseFloat(match[0]) : 0;
        }

        volume += reps * weight;
    }

    return volume;
}

/**
 * Check if a date is part of current streak
 */
export function isPartOfStreak(date: Date, streakDays: number, lastWorkoutDate?: Date): boolean {
    if (!lastWorkoutDate || streakDays === 0) return false;
    
    const daysDiff = Math.floor((lastWorkoutDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff >= 0 && daysDiff < streakDays;
}

/**
 * Check if workout day had a PR (requires stats data)
 */
export function checkIfPRDay(sessionId: string, stats: any): boolean {
    // This would check if this session_id is in the PR list
    // For now, return false until stats endpoint is available
    return false;
}