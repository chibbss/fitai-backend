import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    View,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenWrapper from '@/components/ScreenWrapper';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import { workoutApi } from '@/utils/api';
import Typo from '@/components/Typo';
import * as Icons from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, interpolate } from 'react-native-reanimated';
import { verticalScale } from '@/utils/styling';
import PulseLogo from '@/components/PulseLogo';
import EmptyInsightsState from '@/components/EmptyInsightsState';
import { alert } from '@/utils/alert';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth } from '@/context/AuthContext';
import { cacheUserData, getCachedUserData } from '@/utils/dataCache';
import { logger } from '@/utils/logger';

interface Insight {
    exercise: string;
    status: 'new' | 'progress' | 'regression' | 'maintained' | 'pr';
    message: string;
    delta_pct?: number | null;
    weight_increase?: number | null;
}

interface SessionInsight {
    type: string;  // 'consistency' | 'recovery' | 'pr_context'
    message: string;
    priority: number;
}

interface InsightsData {
    session_id: string;
    insights: Insight[];
    session_insights?: SessionInsight[];
    conversation_hooks?: string[];
    overall_message: string;
    avg_volume_change_pct: number;
    exercise_count: number;
}

interface WorkoutSession {
    session_id: string;
    session_name?: string;
    occurred_at?: string;
    exercise_count?: number;
}

interface WorkoutWithInsights extends WorkoutSession {
    insights?: InsightsData;
}

const InsightsScreen = () => {
    const router = useRouter();
    const { date } = useLocalSearchParams<{ date?: string }>();
    const { colors: themeColors } = useTheme();
    const { user } = useAuth();
    const [insights, setInsights] = useState<InsightsData | null>(null);
    const [workoutsForDate, setWorkoutsForDate] = useState<WorkoutWithInsights[]>([]);
    const [targetDate, setTargetDate] = useState<Date>(new Date());
    const [isLoading, setIsLoading] = useState(true);
    const [chatPrompt, setChatPrompt] = useState<string | null>(null);
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

    const generateChatPrompt = (data: InsightsData): string => {
        // Priority 1: PR detected
        const prInsight = data.insights.find(i => i.status === 'pr');
        if (prInsight) {
            return `I just hit a PR on ${prInsight.exercise}! Tell me about my progress.`;
        }

        // Priority 2: Session insights (consistency, recovery, etc.)
        const topSessionInsight = data.session_insights?.[0];
        if (topSessionInsight && topSessionInsight.priority >= 3) {
            if (topSessionInsight.type === 'consistency') {
                return "I've been consistent this week. How am I doing?";
            }
            if (topSessionInsight.type === 'recovery') {
                return "How's my recovery looking?";
            }
            if (topSessionInsight.type === 'pr_context') {
                return "Tell me about my recent progress.";
            }
        }

        // Priority 3: Use conversation hooks if available
        if (data.conversation_hooks && data.conversation_hooks.length > 0) {
            const hook = data.conversation_hooks[0];
            if (hook.includes('PR')) {
                return "I hit a personal record! What does this mean for my progress?";
            }
            if (hook.includes('streak')) {
                return "I've been on a streak! How can I keep it going?";
            }
        }

        // Fallback
        return "How did I do today?";
    };

    const generateAggregatedInsights = useCallback((workouts: WorkoutWithInsights[], targetDate: Date) => {
        // Aggregate data from all workouts
        const totalExercises = workouts.reduce((sum, w) => sum + (w.exercise_count || 0), 0);
        const totalWorkouts = workouts.length;
        const allInsights = workouts.flatMap(w => w.insights?.insights || []);
        const avgVolumeChange = workouts.reduce((sum, w) => 
            sum + (w.insights?.avg_volume_change_pct || 0), 0
        ) / workouts.length;

        // Check if date is today (compare UTC date strings)
        const todayUTC = new Date().toISOString().split('T')[0];
        const targetDateUTC = targetDate.toISOString().split('T')[0];
        const isToday = targetDateUTC === todayUTC;

        // Format date for display
        const dateLabel = isToday 
            ? "today" 
            : targetDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Create aggregated insights object for display
        const aggregatedInsights: InsightsData = {
            session_id: `${targetDate.toISOString().split('T')[0]}-aggregated`,
            insights: allInsights,
            overall_message: totalWorkouts === 1 
                ? workouts[0].insights?.overall_message || `Great workout ${isToday ? 'today' : 'on ' + dateLabel}!`
                : `Logged ${totalWorkouts} workouts ${isToday ? 'today' : 'on ' + dateLabel} with ${totalExercises} total exercises!`,
            avg_volume_change_pct: avgVolumeChange,
            exercise_count: totalExercises,
        };

        setInsights(aggregatedInsights);

        // Generate chat prompt
        const prompt = generateChatPrompt(aggregatedInsights);
        setChatPrompt(prompt);

        // Cache insights after they're generated
        // Note: We need user and dateStr here, but they're not in scope
        // So we'll cache in the fetchWorkoutsForDate function after generateAggregatedInsights completes
    }, []);

    const fetchWorkoutsForDate = useCallback(async (targetDate: Date) => {
        // Get date range for the target date (using UTC to match API)
        // Parse the date string if targetDate was created from a date string like "2025-12-13"
        const dateStr = targetDate.toISOString().split('T')[0]; // e.g., "2025-12-13"
        
        // Step 1: Try to load cached insights first - show immediately if exists
        let hasCache = false;
        if (user?.id) {
            const cachedInsights = await getCachedUserData<InsightsData>(user.id, `insights_${dateStr}`);
            const cachedWorkouts = await getCachedUserData<WorkoutWithInsights[]>(user.id, `insights_workouts_${dateStr}`);
            
            if (cachedInsights && cachedWorkouts && cachedWorkouts.length > 0) {
                setInsights(cachedInsights);
                setWorkoutsForDate(cachedWorkouts);
                if (cachedWorkouts.length > 0) {
                    setExpandedCards(new Set([cachedWorkouts[0].session_id]));
                }
                logger.log(`[Insights] Showing cached insights for ${dateStr} immediately`);
                setIsLoading(false); // Show cached data immediately
                hasCache = true;
            } else {
                setIsLoading(true); // Only show loading if no cache
            }
        } else {
            setIsLoading(true);
        }
        
        // Step 2: Fetch from backend in background (non-blocking if cache was shown)
        try {

            const startDate = new Date(dateStr + 'T00:00:00.000Z'); // UTC midnight
            const endDate = new Date(dateStr + 'T23:59:59.999Z'); // UTC end of day

            // Get calendar data for the target date (use a range that covers the full day)
            const rangeStart = startDate.toISOString();
            const rangeEnd = new Date(startDate.getTime() + 24 * 60 * 60 * 1000).toISOString(); // Next day at midnight
            
            console.log('🔍 Fetching workouts for date:', dateStr, 'Range:', rangeStart, 'to', rangeEnd);
            const calendarData: any = await workoutApi.getCalendar(
                rangeStart,
                rangeEnd
            );

            console.log('📅 Calendar data received:', calendarData?.items?.length || 0, 'items');

            if (!calendarData?.items || calendarData.items.length === 0) {
                // No workouts for this date, show empty state
                console.log('❌ No workouts found for date');
                setIsLoading(false);
                setWorkoutsForDate([]);
                setInsights(null);
                return;
            }

            // Filter workouts from the target date (compare date strings in UTC)
            console.log('🔍 Filtering workouts for date key:', dateStr);
            
            const workoutsForTargetDate: WorkoutSession[] = (calendarData?.items || []).filter((workout: WorkoutSession) => {
                if (!workout.occurred_at) {
                    console.log('⚠️ Workout missing occurred_at:', workout.session_id);
                    return false;
                }
                // Parse workout date and get UTC date string
                const workoutDate = new Date(workout.occurred_at);
                const workoutDateKey = workoutDate.toISOString().split('T')[0];
                const matches = workoutDateKey === dateStr;
                
                if (matches) {
                    console.log('✅ Workout matches date:', workout.session_id, workoutDateKey);
                } else {
                    console.log(`📅 Workout ${workout.session_id}: occurred_at="${workout.occurred_at}", parsed date="${workoutDateKey}", target="${dateStr}", matches=${matches}`);
                }
                
                return matches;
            });

            console.log('📊 Filtered workouts count:', workoutsForTargetDate.length);

            if (workoutsForTargetDate.length === 0) {
                console.log('❌ No workouts match the target date after filtering');
                setIsLoading(false);
                setWorkoutsForDate([]);
                setInsights(null);
                return;
            }

            // Sort by occurred_at (most recent first)
            workoutsForTargetDate.sort((a, b) => {
                const timeA = a.occurred_at ? new Date(a.occurred_at).getTime() : 0;
                const timeB = b.occurred_at ? new Date(b.occurred_at).getTime() : 0;
                return timeB - timeA;
            });

            // Fetch insights for each workout
            const workoutsWithInsights = await Promise.all(
                workoutsForTargetDate.map(async (workout) => {
                    try {
                        const insightsData = await workoutApi.getInsights(workout.session_id);
                        return {
                            ...workout,
                            insights: insightsData as unknown as InsightsData,
                        };
                    } catch (error: any) {
                        console.error(`Error fetching insights for session ${workout.session_id}:`, error);
                        return {
                            ...workout,
                            insights: undefined,
                        };
                    }
                })
            );

            setWorkoutsForDate(workoutsWithInsights);

            // Expand the most recent workout card by default
            if (workoutsWithInsights.length > 0) {
                setExpandedCards(new Set([workoutsWithInsights[0].session_id]));
            }

            // Generate aggregated overall message and chat prompt
            generateAggregatedInsights(workoutsWithInsights, targetDate);

            // Cache insights data (insights state will be updated by generateAggregatedInsights)
            // We'll cache in the useEffect that watches insights state
        } catch (error: any) {
            console.error('Error fetching workouts for date:', error);
            // Only clear state if we didn't have cache (to preserve cache on error)
            if (!hasCache) {
                setIsLoading(false);
                setWorkoutsForDate([]);
                setInsights(null);
            }
        } finally {
            setIsLoading(false);
        }
    }, [generateAggregatedInsights]);

    // Cache insights when they're updated (permanent - never expires)
    useEffect(() => {
        const cacheInsights = async () => {
            if (!user?.id || !insights || !targetDate) return;
            
            const dateStr = targetDate.toISOString().split('T')[0];
            try {
                await cacheUserData(user.id, `insights_${dateStr}`, insights, Number.MAX_SAFE_INTEGER); // Permanent cache
                // Also cache workouts if available
                if (workoutsForDate.length > 0) {
                    await cacheUserData(user.id, `insights_workouts_${dateStr}`, workoutsForDate, Number.MAX_SAFE_INTEGER); // Permanent cache
                }
                logger.log(`[Insights] Cached insights and workouts for ${dateStr}`);
            } catch (error) {
                logger.error('[Insights] Error caching insights:', error);
            }
        };

        cacheInsights();
    }, [insights, workoutsForDate, user?.id, targetDate]);

    useEffect(() => {
        // Determine target date: use provided date param or default to today
        // Always work in UTC to match how workouts are stored in the database
        let dateToShow: Date;
        if (date) {
            // If date is provided as a string like "2025-12-13", parse as UTC
            dateToShow = new Date(date + 'T00:00:00.000Z');
        } else {
            // For today, use current UTC date (not local date) to match workout storage
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0]; // Get UTC date string
            dateToShow = new Date(todayStr + 'T00:00:00.000Z');
        }
        setTargetDate(dateToShow);
        fetchWorkoutsForDate(dateToShow);
    }, [date, fetchWorkoutsForDate]);


    const toggleCard = (sessionId: string) => {
        setExpandedCards(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sessionId)) {
                newSet.delete(sessionId);
            } else {
                newSet.add(sessionId);
            }
            return newSet;
        });
    };


    const formatTime = (dateString?: string): string => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    };

    const getButtonLabel = (data: InsightsData): string => {
        if (data.insights.some(i => i.status === 'pr')) {
            return "=��� Ask about my PR";
        }
        if (data.session_insights?.[0]?.type === 'consistency') {
            return "=��� Chat about progress";
        }
        return "Chat with FitAI";
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pr':
                return colors.green;
            case 'progress':
                return colors.primary;
            case 'regression':
                return colors.rose;
            case 'new':
                return '#3B82F6';
            default:
                return colors.neutral400;
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pr':
                return 'Trophy';
            case 'progress':
                return 'TrendUp';
            case 'regression':
                return 'TrendDown';
            case 'new':
                return 'Sparkle';
            default:
                return 'CheckCircle';
        }
    };

    // Render workout card component
    const renderWorkoutCard = (workout: WorkoutWithInsights, index: number) => {
        const isExpanded = expandedCards.has(workout.session_id);
        const workoutInsights = workout.insights;

        if (!workoutInsights) {
            // Workout without insights (error loading)
            return (
                <View key={workout.session_id} style={[styles.workoutCard, { backgroundColor: themeColors.cardBackground }]}>
                    <TouchableOpacity
                        onPress={() => toggleCard(workout.session_id)}
                        style={styles.workoutCardHeader}
                        activeOpacity={0.7}
                    >
                        <View style={styles.workoutCardHeaderContent}>
                            <Icons.Barbell size={20} color={themeColors.accentPrimary} weight="fill" />
                            <View style={styles.workoutCardHeaderText}>
                                <Typo size={16} fontWeight="600" color={themeColors.textPrimary}>
                                    {workout.session_name || 'Workout'}
                                </Typo>
                                <Typo size={12} color={themeColors.textSecondary}>
                                    {formatTime(workout.occurred_at)} • {workout.exercise_count || 0} exercises
                                </Typo>
                            </View>
                        </View>
                        <Animated.View style={{
                            transform: [{ rotate: isExpanded ? '180deg' : '0deg' }]
                        }}>
                            <Icons.CaretDown size={20} color={themeColors.textSecondary} weight="bold" />
                        </Animated.View>
                    </TouchableOpacity>
                    {isExpanded && (
                        <View style={styles.workoutCardContent}>
                            <Typo size={14} color={themeColors.textSecondary} style={styles.errorMessage}>
                                Unable to load insights for this workout.
                            </Typo>
                        </View>
                    )}
                </View>
            );
        }

        return (
            <WorkoutCard
                key={workout.session_id}
                workout={workout}
                insights={workoutInsights}
                isExpanded={isExpanded}
                onToggle={() => toggleCard(workout.session_id)}
                themeColors={themeColors}
                getStatusColor={getStatusColor}
                getStatusIcon={getStatusIcon}
                formatTime={formatTime}
            />
        );
    };

    if (isLoading) {
        return (
            <ScreenWrapper showPattern={false}>
                <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
                    <Animated.View entering={FadeInDown.delay(150).springify()}>
                        <PulseLogo size={verticalScale(230)} />
                    </Animated.View>
                    <Animated.View entering={FadeInDown.delay(300).springify()}>
                        <Typo size={18} color={themeColors.textPrimary}
                            style={{ textAlign: 'center', marginTop: -25, marginLeft: 25 }}>
                            Loading your stats...
                        </Typo>
                    </Animated.View>
                </View>
            </ScreenWrapper>
        );
    }

    // Show empty state if no insights (and not loading) and no workouts for date
    if (!isLoading && !insights && workoutsForDate.length === 0) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
                <ScreenWrapper showPattern={false}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={styles.backButton}
                        >
                            <Icons.ArrowLeft size={24} color={themeColors.textPrimary} weight="bold" />
                        </TouchableOpacity>
                        <Typo size={20} fontWeight="600" color={themeColors.textPrimary}>
                            Workout Insights
                        </Typo>
                        <View style={styles.editButton} />
                    </View>

                    {/* Empty State */}
                    <EmptyInsightsState
                        onLogWorkout={() => router.push('/workout-log' as any)}
                        onViewCalendar={() => router.push('/calendar' as any)}
                    />
                </ScreenWrapper>
            </SafeAreaView>
        );
    }

    if (!insights && workoutsForDate.length === 0) {
        return null;
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
            <ScreenWrapper showPattern={false}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={styles.backButton}
                    >
                        <Icons.CaretLeftIcon size={24} color={themeColors.textPrimary} weight="bold" />
                    </TouchableOpacity>
                    <Typo size={20} fontWeight="600" color={themeColors.textPrimary}>
                        Workout Insights
                    </Typo>
                    <View style={styles.editButton} />
                </View>

                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                >
                    {/* Overall Message
                    <LinearGradient
                        colors={themeColors.accentGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.overallCard}
                    > */}
                    {insights && (
                        <View style={[styles.overallCard, { backgroundColor: themeColors.cardBackground }]}>
                            <Icons.ChartLineUp size={36} color={themeColors.textPrimary} weight="fill" />
                            <Typo size={18} fontWeight="600" color={themeColors.textPrimary} style={styles.overallMessage}>
                                {insights.overall_message}
                            </Typo>
                            <Typo size={14} color={themeColors.textPrimary} style={styles.overallSubtext}>
                                {insights.exercise_count} exercises logged
                            </Typo>
                        </View>
                    )}
                    {/* </LinearGradient> */}

                    {/* Workout Cards */}
                    {workoutsForDate.length > 0 && (
                        <View style={styles.workoutsSection}>
                            <Typo size={18} fontWeight="700" color={themeColors.textPrimary} style={styles.sectionTitle}>
                                {(() => {
                                    // Compare dates using UTC date strings
                                    const todayUTC = new Date().toISOString().split('T')[0];
                                    const targetDateUTC = targetDate.toISOString().split('T')[0];
                                    const isToday = targetDateUTC === todayUTC;
                                    if (isToday) {
                                        return "Today's Workouts";
                                    }
                                    // Format the date for display (convert UTC date string back to local date)
                                    const targetDateLocal = new Date(targetDateUTC + 'T12:00:00.000Z'); // Use noon to avoid timezone issues
                                    const dateStr = targetDateLocal.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                                    return `Workouts for ${dateStr}`;
                                })()}
                            </Typo>
                            {workoutsForDate.map((workout, index) => renderWorkoutCard(workout, index))}
                        </View>
                    )}

                    {/* Average Volume Change */}
                    {insights && insights.avg_volume_change_pct !== 0 && (
                        <View style={[styles.summaryCard, { backgroundColor: themeColors.cardBackground }]}>
                            <Typo size={14} color={themeColors.textPrimary} style={styles.summaryLabel}>
                                Average Volume Change
                            </Typo>
                            <Typo
                                size={24}
                                fontWeight="700"
                                color={insights.avg_volume_change_pct > 0 ? colors.green : colors.rose}
                            >
                                {insights.avg_volume_change_pct > 0 ? '+' : ''}
                                {insights.avg_volume_change_pct.toFixed(1)}%
                            </Typo>
                        </View>
                    )}
                </ScrollView>

                {/* Action Buttons */}
                <View style={[styles.footer, { backgroundColor: themeColors.background, borderTopColor: themeColors.textPrimary }]}>
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: themeColors.accentPrimary }]}
                        onPress={() => router.push('/calendar' as any)}
                    >
                        <Icons.Calendar size={20} color={themeColors.background} />
                        <Typo size={14} color={themeColors.background} fontWeight="700">
                            View Calendar
                        </Typo>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: themeColors.accentPrimary }]}
                        onPress={() => {
                            router.push({
                                pathname: '/chatscreen' as any,
                                params: {
                                    prefillQuery: chatPrompt || "How did I do today?"
                                }
                            });
                        }}
                    >
                        <Icons.ChatCircle size={20} color={themeColors.background} weight="bold" />
                        <Typo size={14} color={themeColors.background} fontWeight="700">
                            Chat with FitAI
                        </Typo>
                    </TouchableOpacity>
                </View>
            </ScreenWrapper>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // Remove this line:
        // backgroundColor: colors.white,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacingX._20,
        paddingVertical: spacingY._15,
        borderBottomWidth: 1,
        borderBottomColor: colors.neutral100,
    },
    backButton: {
        padding: spacingX._5,
    },
    editButton: {
        padding: spacingX._5,
    },
    placeholder: {
        width: 34,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacingY._15,
    },
    loadingText: {
        marginTop: spacingY._10,
    },
    content: {
        flex: 1,
        paddingHorizontal: spacingX._20,
    },
    scrollContent: {
        paddingBottom: spacingY._20,
    },
    overallCard: {
        marginTop: spacingY._20,
        padding: spacingX._20,
        borderRadius: radius._20,
        alignItems: 'center',
        gap: spacingY._10,
    },
    overallMessage: {
        textAlign: 'center',
        marginTop: spacingY._5,
    },
    overallSubtext: {
        opacity: 0.9,
    },
    insightsSection: {
        marginTop: spacingY._25,
    },
    sectionTitle: {
        marginBottom: spacingY._15,
    },
    insightCard: {
        flexDirection: 'row',

        borderRadius: radius._15,
        padding: spacingX._15,
        marginBottom: spacingY._12,
        borderWidth: 1,

    },
    statusIndicator: {
        width: 40,
        height: 40,
        borderRadius: radius._10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacingX._12,
    },
    insightContent: {
        flex: 1,
    },
    insightMessage: {
        marginTop: spacingY._5,
        marginBottom: spacingY._10,
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: spacingY._5,
    },
    summaryCard: {
        backgroundColor: colors.neutral50,
        borderRadius: radius._15,
        padding: spacingX._20,
        marginTop: spacingY._20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.neutral200,
    },
    summaryLabel: {
        marginBottom: spacingY._5,
    },
    footer: {
        flexDirection: 'row',
        gap: spacingX._10,
        paddingHorizontal: spacingX._20,
        paddingVertical: spacingY._15,
        borderTopWidth: 1,
        // Remove these lines:
        // borderTopColor: colors.neutral100,
        // backgroundColor: colors.white,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacingX._10,
        paddingVertical: spacingY._12,
        borderRadius: radius._15,

        borderWidth: 1,

    },
    workoutsSection: {
        marginTop: spacingY._25,
    },
    workoutCard: {
        borderRadius: radius._15,
        padding: spacingX._15,
        marginBottom: spacingY._12,
        borderWidth: 1,
        borderColor: colors.neutral200,
    },
    workoutCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    workoutCardHeaderContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: spacingX._12,
    },
    workoutCardHeaderText: {
        flex: 1,
    },
    workoutCardContent: {
        marginTop: spacingY._15,
        paddingTop: spacingY._15,
        borderTopWidth: 1,
        borderTopColor: colors.neutral200,
    },
    errorMessage: {
        textAlign: 'center',
        paddingVertical: spacingY._10,
    },
});

// Collapsible Workout Card Component
interface WorkoutCardProps {
    workout: WorkoutWithInsights;
    insights: InsightsData;
    isExpanded: boolean;
    onToggle: () => void;
    themeColors: any;
    getStatusColor: (status: string) => string;
    getStatusIcon: (status: string) => string;
    formatTime: (dateString?: string) => string;
}

const WorkoutCard: React.FC<WorkoutCardProps> = ({
    workout,
    insights,
    isExpanded,
    onToggle,
    themeColors,
    getStatusColor,
    getStatusIcon,
    formatTime,
}) => {
    const rotation = useSharedValue(isExpanded ? 180 : 0);
    const height = useSharedValue(isExpanded ? 1 : 0);

    React.useEffect(() => {
        rotation.value = withTiming(isExpanded ? 180 : 0, { duration: 200 });
        height.value = withTiming(isExpanded ? 1 : 0, { duration: 200 });
    }, [isExpanded, rotation, height]);

    const chevronStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    const contentStyle = useAnimatedStyle(() => {
        const opacity = interpolate(height.value, [0, 1], [0, 1]);
        const maxHeight = interpolate(height.value, [0, 1], [0, 2000]);
        return {
            opacity,
            maxHeight,
            overflow: 'hidden' as const,
        };
    });

    return (
        <View style={[styles.workoutCard, { backgroundColor: themeColors.cardBackground }]}>
            <TouchableOpacity
                onPress={onToggle}
                style={styles.workoutCardHeader}
                activeOpacity={0.7}
            >
                <View style={styles.workoutCardHeaderContent}>
                    <Icons.Barbell size={20} color={themeColors.accentPrimary} weight="fill" />
                    <View style={styles.workoutCardHeaderText}>
                        <Typo size={16} fontWeight="600" color={themeColors.textPrimary}>
                            {workout.session_name || 'Workout'}
                        </Typo>
                        <Typo size={12} color={themeColors.textSecondary}>
                            {formatTime(workout.occurred_at)} • {workout.exercise_count || 0} exercises
                        </Typo>
                    </View>
                </View>
                <Animated.View style={chevronStyle}>
                    <Icons.CaretDown size={20} color={themeColors.textSecondary} weight="bold" />
                </Animated.View>
            </TouchableOpacity>
            <Animated.View style={[styles.workoutCardContent, contentStyle]}>
                {insights.insights.map((insight, index) => {
                    const IconComponent = Icons[getStatusIcon(insight.status) as keyof typeof Icons] as React.ComponentType<any>;
                    const statusColor = getStatusColor(insight.status);

                    return (
                        <View key={index} style={[styles.insightCard, { backgroundColor: themeColors.cardBackground, marginBottom: spacingY._10 }]}>
                            <View style={[styles.statusIndicator, { backgroundColor: statusColor }]}>
                                <IconComponent size={20} color={colors.white} weight="fill" />
                            </View>
                            <View style={styles.insightContent}>
                                <Typo size={16} fontWeight="700" color={themeColors.accentPrimary}>
                                    {insight.exercise}
                                </Typo>
                                <Typo size={14} color={themeColors.textPrimary} style={styles.insightMessage}>
                                    {insight.message}
                                </Typo>
                                {insight.delta_pct !== null && insight.delta_pct !== undefined && (
                                    <View style={styles.metricRow}>
                                        <Typo size={12} color={themeColors.textPrimary}>
                                            Volume change:
                                        </Typo>
                                        <Typo
                                            size={12}
                                            color={insight.delta_pct > 0 ? colors.green : colors.rose}
                                            fontWeight="600"
                                        >
                                            {insight.delta_pct > 0 ? '+' : ''}
                                            {insight.delta_pct.toFixed(1)}%
                                        </Typo>
                                    </View>
                                )}
                                {insight.weight_increase !== null && insight.weight_increase !== undefined && (
                                    <View style={styles.metricRow}>
                                        <Typo size={12} color={themeColors.textPrimary}>
                                            Weight increase:
                                        </Typo>
                                        <Typo size={12} color={colors.green} fontWeight="600">
                                            +{insight.weight_increase.toFixed(1)}kg
                                        </Typo>
                                    </View>
                                )}
                            </View>
                        </View>
                    );
                })}
            </Animated.View>
        </View>
    );
};

const InsightsScreenComponent = InsightsScreen;

export default function ProtectedInsightsScreen() {
    return (
        <AuthGuard>
            <InsightsScreenComponent />
        </AuthGuard>
    );
}
