import { userApi } from './api';
import { UserProfile } from '@/types/api';
import { logger } from './logger';

export interface OnboardingStatusResult {
    userData: UserProfile | null;
    isComplete: boolean;
}

/**
 * Check the onboarding status for a user
 * Returns the user's profile data including goals and profile information
 */
export async function checkOnboardingStatus(userId: string): Promise<OnboardingStatusResult> {
    try {
        const userData = await userApi.getUser(userId);
        
        if (!userData) {
            logger.log('[Onboarding] No user data returned for userId:', userId);
            return {
                userData: null,
                isComplete: false,
            };
        }

        // Check if onboarding is complete
        // Onboarding is considered complete if user has:
        // - primary_goal in goals
        // - experience_level in profile
        // - workout_preference in profile
        const hasGoal = !!userData.goals?.primary_goal;
        const hasExperience = !!userData.profile?.experience_level;
        const hasPreference = !!userData.profile?.workout_preference;
        
        const isComplete = hasGoal && hasExperience && hasPreference;

        logger.log('[Onboarding] Status checked:', {
            userId,
            hasGoal,
            hasExperience,
            hasPreference,
            isComplete,
            userDataStructure: {
                hasGoals: !!userData.goals,
                hasProfile: !!userData.profile,
                goalsKeys: userData.goals ? Object.keys(userData.goals) : [],
                profileKeys: userData.profile ? Object.keys(userData.profile) : [],
            },
        });

        // If incomplete, log the missing fields for debugging
        if (!isComplete) {
            logger.log('[Onboarding] Missing fields:', {
                missingGoal: !hasGoal,
                missingExperience: !hasExperience,
                missingPreference: !hasPreference,
            });
        }

        return {
            userData,
            isComplete,
        };
    } catch (error: any) {
        logger.error('[Onboarding] Error checking status:', error);
        logger.error('[Onboarding] Error details:', {
            message: error?.message,
            stack: error?.stack,
            userId,
        });
        // On error, return incomplete to be safe (user will see onboarding)
        return {
            userData: null,
            isComplete: false,
        };
    }
}

