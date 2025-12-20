import { workoutApi } from './api';
import { logger } from './logger';

export interface GreetingData {
    message: string;
    prompts?: string[];
}

export async function generatePersonalizedGreeting(): Promise<GreetingData> {
    try {
        // Get weekly summary
        const weekly = await workoutApi.getWeeklySummary();
        const workoutsThisWeek = weekly.days.filter((d: any) => d.has_workout).length;
        
        // Get recent workout sessions with insights
        const recentWorkouts = weekly.days
            .filter((d: any) => d.has_workout && d.session_id)
            .slice(0, 3);
        
        // Check for PRs in recent workouts
        let prDetected = false;
        let prExercise = '';
        
        for (const day of recentWorkouts) {
            try {
                const insights = await workoutApi.getInsights(day.session_id);
                const prInsight = insights.insights?.find((i: any) => i.status === 'pr');
                if (prInsight) {
                    prDetected = true;
                    prExercise = prInsight.exercise;
                    break;
                }
            } catch (error) {
                // Skip if insights fail
                continue;
            }
        }
        
        // Generate greeting based on patterns
        let greeting = "";
        let prompts: string[] = [];
        
        if (prDetected) {
            greeting = `🎉 Hey! I noticed you hit a PR on ${prExercise}! Want to talk about your progress?`;
            prompts = [
                "Tell me more about my PR",
                "What should I focus on next?",
                "How's my overall progress?"
            ];
        } else if (workoutsThisWeek >= 4) {
            greeting = `Hey! You've been crushing it this week with ${workoutsThisWeek} workouts. Want to discuss your progress?`;
            prompts = [
                "Review my week",
                "What should I focus on?",
                "Help me plan next week"
            ];
        } else if (workoutsThisWeek === 0) {
            greeting = "Welcome back! Ready to get back on track? How can I help you today?";
            prompts = [
                "Help me get started",
                "Create a workout plan",
                "Motivate me"
            ];
        } else if (workoutsThisWeek >= 2) {
            greeting = `Good to see you! You've logged ${workoutsThisWeek} workouts this week. How can I help?`;
            prompts = [
                "How am I doing?",
                "What should I focus on?",
                "Review my progress"
            ];
        } else {
            // Default greeting
            greeting = "Hey! Ready to crush your fitness goals?";
            prompts = [
                "Create workout plan",
                "Track progress",
                "Get advice"
            ];
        }
        
        return { message: greeting, prompts };
    } catch (error) {
        logger.error('Error generating personalized greeting:', error);
        // Fallback to default
        return {
            message: "Ready to crush your fitness goals?",
            prompts: [
                "Create workout plan",
                "Track progress",
                "Get advice"
            ]
        };
    }
}

