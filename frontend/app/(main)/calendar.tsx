import CalendarView from '@/components/CalendarView';
import QuickStatsCards from '@/components/QuickStatsCards';
import ScreenWrapper from '@/components/ScreenWrapper';
import StatsSection from '@/components/StatsSection';
import Typo from '@/components/Typo';
import WeeklySummaryStrip from '@/components/WeeklySummaryStrip';
import RNCalendarsTest from '@/components/RNCalendarsTest';
import { colors, spacingX, spacingY } from '@/constants/theme';
import { workoutApi } from '@/utils/api';
import { useRouter } from 'expo-router';
import * as Icons from 'phosphor-react-native';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { verticalScale } from '@/utils/styling';
import PulseLogo from '@/components/PulseLogo';
import EmptyCalendarState from '@/components/EmptyCalendarState';
import { alert } from '@/utils/alert';
import { AuthGuard } from '@/components/AuthGuard';
import { perf } from '@/utils/performance';
import { logger } from '@/utils/logger';
import { useAuth } from '@/context/AuthContext';
import { cacheUserData, getCachedUserData } from '@/utils/dataCache';
import { useFocusEffect } from '@react-navigation/native';

const { width } = Dimensions.get('window');

interface CalendarItem {
    session_id: string;
    session_name?: string;
    session_type?: string;
    occurred_at?: string;
    duration_minutes?: number;
    notes?: string;
    metadata: Record<string, any>;

    volume_kg?: number;
    exercise_count?: number;
    has_pr?: boolean;
    muscle_groups?: string[];
    intensity_level?: 'light' | 'medium' | 'heavy' | 'very_heavy';
}

interface WorkoutStats {
    session_id: string;
    stats: {
        consistency: {
            sessions_this_week: number;
            sessions_this_month: number;
            total_sessions: number;
            current_streak: number;
            weekly_frequency: number;
            best_streak: number;
        };
        volume: {
            total_volume_week: number;
            total_volume_month: number;
            volume_trend: string;
            avg_session_volume: number;
            volume_by_group: {
                push: number;
                pull: number;
                legs: number;
            };
        };
        exercises: {
            top_5: Array<{ name: string; frequency: number }>;
            variety: number;
            most_trained_group: string;
            least_trained_group: string;
        };
        recovery: {
            avg_recovery_days: number;
            recovery_trend: string;
            days_since_last: number;
            rest_days_per_week: number;
        };
        progress: {
            prs_this_week: number;
            prs_this_month: number;
            strength_progression: string;
            plateaus: Array<{ exercise: string; weeks: number }>;
        };
    }
}

const CalendarScreen = () => {
    const router = useRouter();
    const { colors: themeColors } = useTheme();
    const { user } = useAuth();
    const [workouts, setWorkouts] = useState<CalendarItem[]>([]);
    const [stats, setStats] = useState<WorkoutStats | null>(null);
    const [isLoading, setIsLoading] = useState(true); // Initial load only
    const [isCalendarLoading, setIsCalendarLoading] = useState(false); // Calendar loading
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const isTransitioningRef = useRef(false); // Synchronous ref to track transitions
    const previousMonthRef = useRef<Date>(new Date()); // Track previous month
    const lastNavigationTimeRef = useRef<number>(0); // Track when we last navigated
    const hasEverLoadedRef = useRef(false); // Track if we've ever successfully loaded data

    // Weekly strip state
    const [currentWeekStart, setCurrentWeekStart] = useState<string>(() => {
        // Get Monday of current week
        const today = new Date();
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(today.setDate(diff));
        return monday.toISOString().split('T')[0];
    });

    // Load cached data on mount
    useEffect(() => {
        const loadCachedData = async () => {
            if (!user?.id) return;

            try {
                const monthKey = `${selectedMonth.getFullYear()}-${selectedMonth.getMonth()}`;
                const cachedWorkouts = await getCachedUserData<CalendarItem[]>(user.id, `calendar_${monthKey}`);
                const cachedStats = await getCachedUserData<WorkoutStats>(user.id, 'calendar_stats');

                if (cachedWorkouts && cachedWorkouts.length > 0) {
                    setWorkouts(cachedWorkouts);
                    hasEverLoadedRef.current = true; // Mark that we've loaded data
                    logger.log(`[Calendar] Loaded ${cachedWorkouts.length} cached workouts for ${monthKey}`);
                    // Don't clear transition flag here - let fetchCalendarData clear it
                    // This ensures we don't show empty state if backend returns different data
                } else if (!isLoading) {
                    // No cache found - keep transition flag true and previous workouts visible
                    // This prevents empty state flash - workouts will be updated by fetchCalendarData
                    // Don't clear workouts here - let fetchCalendarData handle it
                }

                if (cachedStats) {
                    setStats(cachedStats);
                    logger.log('[Calendar] Loaded cached stats');
                }
            } catch (error) {
                logger.error('[Calendar] Error loading cached data:', error);
            }
        };

        loadCachedData();
    }, [user?.id, selectedMonth]);

    useEffect(() => {
        // Check if month actually changed
        const monthChanged = previousMonthRef.current.getMonth() !== selectedMonth.getMonth() ||
            previousMonthRef.current.getFullYear() !== selectedMonth.getFullYear();

        if (monthChanged && !isLoading) {
            // Month changed - set transition flag and loading state synchronously to prevent flash
            // Set both immediately before any async operations
            isTransitioningRef.current = true;
            setIsCalendarLoading(true);
            lastNavigationTimeRef.current = Date.now(); // Track navigation time
            previousMonthRef.current = new Date(selectedMonth);
        }

        if (isLoading) {
            // First load - use full loading screen
            fetchData();
        } else if (monthChanged) {
            // Subsequent loads - loading state already set above, now fetch data
            fetchCalendarData();
        }
    }, [selectedMonth]);

    const fetchData = async () => {
        const endPerf = perf.start('fetchData');

        // Step 1: Check cache first - show immediately if exists
        if (user?.id) {
            const monthKey = `${selectedMonth.getFullYear()}-${selectedMonth.getMonth()}`;
            const cachedWorkouts = await getCachedUserData<CalendarItem[]>(user.id, `calendar_${monthKey}`);
            const cachedStats = await getCachedUserData<WorkoutStats>(user.id, 'calendar_stats');

            if (cachedWorkouts && cachedWorkouts.length > 0) {
                setWorkouts(cachedWorkouts);
                hasEverLoadedRef.current = true;
                logger.log(`[Calendar] Showing ${cachedWorkouts.length} cached workouts immediately`);
                setIsLoading(false); // Show cached data immediately

                if (cachedStats) {
                    setStats(cachedStats);
                }
            } else {
                setIsLoading(true); // Only show loading if no cache
            }
        } else {
            setIsLoading(true);
        }

        // Step 2: Fetch from backend in background (non-blocking if cache was shown)
        try {
            // 1. Fetch calendar data for current month with enhanced fields
            const startDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
            const endDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);

            logger.log('[Calendar] Fetching from backend for month:', selectedMonth);
            logger.log('[Calendar] Date range:', startDate.toISOString(), 'to', endDate.toISOString());

            const calendarData = await workoutApi.getCalendar(
                startDate.toISOString(),
                endDate.toISOString()
            ) as { items?: CalendarItem[]; total?: number };

            logger.log('[Calendar] Backend returned:', calendarData.items?.length || 0, 'workouts');

            const workoutItems = calendarData.items || [];
            setWorkouts(workoutItems);
            hasEverLoadedRef.current = true; // Mark that we've loaded data

            // Cache calendar data (permanent - never expires)
            if (user?.id) {
                const monthKey = `${selectedMonth.getFullYear()}-${selectedMonth.getMonth()}`;
                await cacheUserData(user.id, `calendar_${monthKey}`, workoutItems, Number.MAX_SAFE_INTEGER); // Permanent cache
                logger.log(`[Calendar] Cached ${workoutItems.length} workouts for ${monthKey}`);
            }

            // 2. Start stats fetch immediately (parallel) - don't wait for calendar processing
            const statsPromise = workoutItems.length > 0
                ? workoutApi.getStats(workoutItems[0].session_id)
                    .then(async (statsData) => {
                        // Cast to local WorkoutStats type (has stats property)
                        const typedStatsData = statsData as unknown as WorkoutStats;
                        if (typedStatsData && typedStatsData.stats) {
                            setStats(typedStatsData);
                            // Cache stats (permanent - never expires)
                            if (user?.id) {
                                await cacheUserData(user.id, 'calendar_stats', typedStatsData, Number.MAX_SAFE_INTEGER); // Permanent cache
                                logger.log('[Calendar] Cached stats');
                            }
                        }
                    })
                    .catch((statsError: any) => {
                        // Stats endpoint might not be available or might fail - that's okay, just log it
                        logger.warn('Failed to load stats:', statsError);
                    })
                : Promise.resolve(null);

            // Wait for stats to complete (already started in parallel)
            await statsPromise;
        } catch (error: any) {
            logger.error('[Calendar] Error fetching data:', error);
            const errorMsg = error?.message;
            alert.error(errorMsg && typeof errorMsg === 'string' ? errorMsg : 'Failed to load data', 'Error');
        } finally {
            setIsLoading(false);
            endPerf();
        }
    };

    const fetchCalendarData = async () => {
        const endPerf = perf.start('fetchCalendarData');

        // Step 1: Check cache first - show immediately if exists
        if (user?.id) {
            const monthKey = `${selectedMonth.getFullYear()}-${selectedMonth.getMonth()}`;
            const cachedWorkouts = await getCachedUserData<CalendarItem[]>(user.id, `calendar_${monthKey}`);
            const cachedStats = await getCachedUserData<WorkoutStats>(user.id, 'calendar_stats');

            if (cachedWorkouts && cachedWorkouts.length > 0) {
                setWorkouts(cachedWorkouts);
                hasEverLoadedRef.current = true;
                logger.log(`[Calendar] Showing ${cachedWorkouts.length} cached workouts immediately (month change)`);
                setIsCalendarLoading(false); // Show cached data immediately

                if (cachedStats) {
                    setStats(cachedStats);
                }
            }
        }

        // Step 2: Fetch from backend in background (non-blocking if cache was shown)
        try {
            // 1. Fetch calendar data for current month
            const startDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
            const endDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);

            const calendarData = await workoutApi.getCalendar(
                startDate.toISOString(),
                endDate.toISOString()
            ) as { items?: CalendarItem[]; total?: number };
            const workoutItems = calendarData.items || [];
            setWorkouts(workoutItems);
            // Clear transition flag once data is loaded (even if empty)
            // Use longer timeout to ensure state updates have propagated and component has re-rendered
            // This prevents empty state check from passing during transition
            setTimeout(() => {
                isTransitioningRef.current = false;
            }, 300);

            // Cache calendar data (permanent - never expires)
            if (user?.id) {
                const monthKey = `${selectedMonth.getFullYear()}-${selectedMonth.getMonth()}`;
                await cacheUserData(user.id, `calendar_${monthKey}`, workoutItems, Number.MAX_SAFE_INTEGER); // Permanent cache
                logger.log(`[Calendar] Cached ${workoutItems.length} workouts for ${monthKey}`);
            }

            // 2. Start stats fetch immediately (parallel) - don't wait for calendar processing
            const statsPromise = workoutItems.length > 0
                ? workoutApi.getStats(workoutItems[0].session_id)
                    .then(async (statsData) => {
                        // Cast to local WorkoutStats type (has stats property)
                        const typedStatsData = statsData as unknown as WorkoutStats;
                        if (typedStatsData && typedStatsData.stats) {
                            setStats(typedStatsData);
                            // Cache stats (permanent - never expires)
                            if (user?.id) {
                                await cacheUserData(user.id, 'calendar_stats', typedStatsData, Number.MAX_SAFE_INTEGER); // Permanent cache
                                logger.log('[Calendar] Cached stats');
                            }
                        }
                    })
                    .catch((statsError: any) => {
                        // Stats endpoint might not be available or might fail - that's okay, just log it
                        logger.warn('Failed to load stats:', statsError);
                    })
                : Promise.resolve(null);

            // Wait for stats to complete (already started in parallel)
            await statsPromise;
        } catch (error: any) {
            const errorMsg = error?.message;
            alert.error(errorMsg && typeof errorMsg === 'string' ? errorMsg : 'Failed to load calendar data', 'Error');
            // Clear transition flag even on error
            isTransitioningRef.current = false;
        } finally {
            setIsCalendarLoading(false);
            endPerf();
        }
    };

    // Group workouts by date for calendar
    const workoutsByDate = useMemo(() => {
        const grouped: Record<string, CalendarItem> = {};
        workouts.forEach(workout => {
            if (workout.occurred_at) {
                const date = new Date(workout.occurred_at);
                const dateKey = date.toISOString().split('T')[0];
                grouped[dateKey] = workout;
            }
        });
        return grouped;
    }, [workouts]);

    const handleDayPress = (date: Date) => {
        const dateKey = date.toISOString().split('T')[0];
        const todayKey = new Date().toISOString().split('T')[0];
        const hasWorkout = !!workoutsByDate[dateKey];

        // Only navigate for today or days that have at least one workout
        if (!hasWorkout && dateKey !== todayKey) {
            return;
        }

        if (dateKey === todayKey) {
            // Today: navigate without params to show all today's workouts
            router.push({ pathname: '/insights' as any });
        } else {
            // Past day: navigate with date parameter to show all workouts from that day
            router.push({
                pathname: '/insights' as any,
                params: { date: dateKey },
            });
        }
    };

    const handleWeeklyDayPress = (sessionId: string | null, date: string) => {
        // Only navigate if there's a workout logged for this day
        if (!sessionId) {
            return;
        }

        const dateKey = date.split('T')[0];
        const todayKey = new Date().toISOString().split('T')[0];

        if (dateKey === todayKey) {
            // Today: navigate without params to show all today's workouts
            router.push({ pathname: '/insights' as any });
        } else {
            // Past day: navigate with date parameter to show all workouts from that day
            router.push({
                pathname: '/insights' as any,
                params: { date: dateKey },
            });
        }
    };

    const handleWeekChange = (newWeekStart: string) => {
        setCurrentWeekStart(newWeekStart);
        // Optionally sync calendar month if week is in different month
        const weekStartDate = new Date(newWeekStart);
        const weekMonth = weekStartDate.getMonth();
        const weekYear = weekStartDate.getFullYear();

        if (selectedMonth.getMonth() !== weekMonth || selectedMonth.getFullYear() !== weekYear) {
            setSelectedMonth(new Date(weekYear, weekMonth, 1));
        }
    };

    const handleMonthChange = (newMonth: Date) => {
        setSelectedMonth(newMonth);
    };

    if (isLoading) {
        // Only show full loading screen on initial load
        const { colors: themeColors } = useTheme();
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

    // Show empty state only on initial load completion when there are no workouts
    // During month navigation (isCalendarLoading or isTransitioningRef), always show calendar view with skeleton
    // This prevents empty state from showing when navigating to months with no workouts
    // Use ref for synchronous check to prevent flash during state updates
    const isTransitioning = isCalendarLoading || isTransitioningRef.current;

    // Check if we're on the current month
    const currentMonth = new Date();
    const isCurrentMonth = selectedMonth.getMonth() === currentMonth.getMonth() &&
        selectedMonth.getFullYear() === currentMonth.getFullYear();

    // Only show empty state if:
    // - Initial load is complete (isLoading === false)
    // - We've never loaded data before (hasEverLoadedRef === false) - this means it's truly the first load
    // - Not transitioning (even if navigating back to current month)
    // - Not currently loading calendar data
    // - No workouts
    // - On current month
    // This ensures empty state only shows on the very first load, never during month navigation
    const hasJustNavigated = isTransitioningRef.current || isCalendarLoading;
    const recentlyNavigated = Date.now() - lastNavigationTimeRef.current < 1000; // Increased to 1 second
    const isFirstLoad = !hasEverLoadedRef.current;

    // Only show empty state on the very first load completion, never during navigation
    if (!isLoading && isFirstLoad && !hasJustNavigated && !recentlyNavigated && workouts.length === 0 && isCurrentMonth) {
        // Show empty state only on the very first load when there's no data
        // Never show during month navigation (hasEverLoadedRef will be true after first load)
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
                <ScreenWrapper showPattern={false}>
                    {/* --- Header --- */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={styles.backButton}
                        >
                            <Icons.CaretLeft size={26} color={themeColors.textPrimary} weight="bold" />
                        </TouchableOpacity>

                        <Typo size={24} fontWeight="700" color={themeColors.textPrimary}>
                            Calendar And Stats
                        </Typo>

                        <TouchableOpacity
                            onPress={() => router.push('/workout-log' as any)}
                            style={styles.addButton}
                        >
                            <Icons.Plus size={26} color={themeColors.textPrimary} weight="bold" />
                        </TouchableOpacity>
                    </View>

                    {/* Empty State */}
                    <EmptyCalendarState
                        onLogWorkout={() => router.push('/workout-log' as any)}
                        onChatWithAI={() => router.push('/chatscreen' as any)}
                    />
                </ScreenWrapper>
            </SafeAreaView>
        );
    }
    // If navigating to a different month with no workouts, show calendar view (will be empty but navigable)

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
            <ScreenWrapper showPattern={false}>
                <View style={[styles.whiteBackground, { backgroundColor: themeColors.background }]}>
                    {/* --- Header --- */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={styles.backButton}
                        >
                            <Icons.CaretLeft size={26} color={themeColors.textPrimary} weight="bold" />
                        </TouchableOpacity>

                        <Typo size={24} fontWeight="700" color={themeColors.textPrimary}>
                            Calendar And Stats
                        </Typo>

                        <TouchableOpacity
                            onPress={() => router.push('/workout-log' as any)}
                            style={styles.addButton}
                        >
                            <Icons.Plus size={26} color={themeColors.textPrimary} weight="bold" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.content}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                    >
                        {/* --- Collapsible Calendar --- */}
                        <View style={styles.calendarSection}>
                            <RNCalendarsTest
                                selectedMonth={selectedMonth}
                                workouts={workoutsByDate}
                                stats={stats}
                                onDayPress={handleDayPress}
                                onMonthChange={handleMonthChange}
                                isLoading={isCalendarLoading} // Pass loading state
                            />
                        </View>
                        {/* --- Weekly Summary Strip --- */}
                        <View style={styles.weeklyStripSection}>
                            <WeeklySummaryStrip
                                weekStartDate={currentWeekStart}
                                onDayPress={handleWeeklyDayPress}
                                onWeekChange={handleWeekChange}
                            />
                        </View>

                        {/* --- Quick Stats Cards --- */}
                        {stats && (
                            <View style={styles.quickStatsSection}>
                                <QuickStatsCards stats={stats.stats} />
                            </View>
                        )}


                        {/* --- Stats Dashboard Section --- */}
                        {stats ? (
                            <>
                                {/* --- Consistency Stats --- */}
                                <StatsSection
                                    title="Consistency"
                                    icon="Calendar"
                                    collapsible={true}
                                    defaultExpanded={true}
                                    stats={[
                                        { label: 'Sessions this week', value: stats.stats.consistency.sessions_this_week.toString() },
                                        { label: 'Sessions this month', value: stats.stats.consistency.sessions_this_month.toString() },
                                        {
                                            label: 'Current streak',
                                            value: `${stats.stats.consistency.current_streak} days`,
                                            highlight: stats.stats.consistency.current_streak >= 7
                                        },
                                        { label: 'Weekly frequency', value: `${stats.stats.consistency.weekly_frequency}x` },
                                    ]}
                                />

                                {/* --- Volume Stats --- */}
                                <StatsSection
                                    title="Volume"
                                    icon="TrendUp"
                                    collapsible={true}
                                    defaultExpanded={true}
                                    keyMetric={{
                                        value: `${Math.round(stats.stats.volume.total_volume_week).toLocaleString()} kg`,
                                        label: 'This Week',
                                        subtitle: stats.stats.volume.volume_trend && stats.stats.volume.volume_trend !== 'N/A'
                                            ? `${stats.stats.volume.volume_trend} vs last week`
                                            : 'Insufficient data for trend',
                                        icon: stats.stats.volume.volume_trend?.includes('+') ? 'TrendUp' : (stats.stats.volume.volume_trend?.includes('-') ? 'TrendDown' : undefined),
                                    }}
                                    stats={[
                                        { label: 'This month', value: `${Math.round(stats.stats.volume.total_volume_month).toLocaleString()} kg` },
                                        { label: 'Avg session', value: `${Math.round(stats.stats.volume.avg_session_volume).toLocaleString()} kg` },
                                        {
                                            label: 'By Muscle Group',
                                            value: (() => {
                                                const push = Math.round(stats.stats.volume.volume_by_group.push);
                                                const pull = Math.round(stats.stats.volume.volume_by_group.pull);
                                                const legs = Math.round(stats.stats.volume.volume_by_group.legs);
                                                const total = push + pull + legs;

                                                const pushPct = total > 0 ? Math.round((push / total) * 100) : 0;
                                                const pullPct = total > 0 ? Math.round((pull / total) * 100) : 0;
                                                const legsPct = total > 0 ? Math.round((legs / total) * 100) : 0;

                                                return `Push: ${push.toLocaleString()} kg (${pushPct}%) | Pull: ${pull.toLocaleString()} kg (${pullPct}%) | Legs: ${legs.toLocaleString()} kg (${legsPct}%)`;
                                            })(),
                                        },
                                    ]}
                                />

                                {/* --- Exercises Frequency Stats --- */}
                                <StatsSection
                                    title="Exercises"
                                    icon="Barbell"
                                    collapsible={true}
                                    defaultExpanded={true}
                                    stats={[
                                        { label: 'Top 5 This Month:', value: '', highlight: true },
                                        ...stats.stats.exercises.top_5.map((ex, idx) => ({
                                            label: `${idx + 1}. ${ex.name}`,
                                            value: `${ex.frequency}x`,
                                        })),
                                        { label: 'Variety', value: `${stats.stats.exercises.variety} exercises` },
                                        { label: 'Most trained', value: stats.stats.exercises.most_trained_group },
                                        { label: 'Least trained', value: stats.stats.exercises.least_trained_group },
                                    ]}
                                />

                                {/* --- Recovery Stats --- */}
                                <StatsSection
                                    title="Recovery"
                                    icon="Heart"
                                    collapsible={true}
                                    defaultExpanded={true}
                                    keyMetric={{
                                        value: stats.stats.recovery.avg_recovery_days
                                            ? `${stats.stats.recovery.avg_recovery_days} days`
                                            : 'N/A',
                                        label: 'Avg Recovery',
                                        subtitle: stats.stats.recovery.avg_recovery_days
                                            ? (stats.stats.recovery.avg_recovery_days <= 2 ? 'Optimal for growth' : 'Consider more rest')
                                            : 'Insufficient data',
                                        icon: stats.stats.recovery.avg_recovery_days && stats.stats.recovery.avg_recovery_days <= 2 ? 'Check' : undefined,
                                    }}
                                    stats={[
                                        { label: 'Days since last workout', value: `${stats.stats.recovery.days_since_last} day${stats.stats.recovery.days_since_last !== 1 ? 's' : ''}` },
                                        { label: 'Rest days per week', value: stats.stats.recovery.rest_days_per_week.toString() },
                                        { label: 'Recovery trend', value: (stats.stats.recovery.recovery_trend && stats.stats.recovery.recovery_trend !== 'N/A') ? stats.stats.recovery.recovery_trend : 'Stable' },
                                    ]}
                                />

                                {/* --- Progress Stats --- */}
                                <StatsSection
                                    title="Progress"
                                    icon="Trophy"
                                    collapsible={true}
                                    defaultExpanded={true}
                                    keyMetric={{
                                        value: stats.stats.progress.prs_this_week.toString(),
                                        label: 'PRs This Week',
                                        subtitle: `${stats.stats.progress.prs_this_month} PRs this month`,
                                        icon: 'Trophy',
                                    }}
                                    stats={[
                                        {
                                            label: 'PRs this week',
                                            value: stats.stats.progress.prs_this_week.toString(),
                                            highlight: stats.stats.progress.prs_this_week > 0
                                        },
                                        { label: 'PRs this month', value: stats.stats.progress.prs_this_month.toString() },
                                        {
                                            label: 'Strength progression',
                                            value: stats.stats.progress.strength_progression,
                                            highlight: stats.stats.progress.strength_progression?.startsWith('+') ?? false
                                        },
                                        ...(stats.stats.progress.plateaus.length > 0
                                            ? stats.stats.progress.plateaus.map(plateau => ({
                                                label: 'Plateau',
                                                value: `${plateau.exercise} (${plateau.weeks} weeks)`,
                                                warning: true
                                            }))
                                            : [])
                                    ]}
                                />
                            </>
                        ) : (
                            <View style={styles.noStatsContainer}>
                                <Icons.ChartLineUp size={48} color={themeColors.accentPrimary} />
                                <Typo size={16} color={themeColors.textPrimary} style={styles.noStatsText}>
                                    Stats will appear here once you log more workouts
                                </Typo>

                            </View>
                        )}
                    </ScrollView>
                </View>
            </ScreenWrapper>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,

    },
    whiteBackground: {
        ...StyleSheet.absoluteFillObject,

        paddingTop: Platform.OS === 'ios' ? Dimensions.get('window').height * 0.06 : 40,
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
    addButton: {
        padding: spacingX._5,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacingY._60,
    },
    loadingText: {
        marginTop: spacingY._10,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: spacingY._30,
    },
    weeklyStripSection: {
        marginTop: spacingY._10,
    },
    calendarSection: {
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._20,
    },
    quickStatsSection: {
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._20,
        marginBottom: spacingY._20,
    },
    noStatsContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacingY._40,
        paddingHorizontal: spacingX._20,
    },
    noStatsText: {
        marginTop: spacingY._15,
        textAlign: 'center',
    },
    noStatsSubtext: {
        marginTop: spacingY._5,
        textAlign: 'center',
    },
    skeletonText: {
        width: 150,
        height: 20,
        backgroundColor: colors.neutral200,
        borderRadius: 5,
    },
    skeletonButtons: {
        flexDirection: 'row',
        gap: spacingX._10,
    },
    skeletonButton: {
        width: 40,
        height: 40,
        backgroundColor: colors.neutral200,
        borderRadius: 20,
    },
    skeletonDayLabel: {
        flex: 1,
        height: 30,
        backgroundColor: colors.neutral200,
        borderRadius: 10,
        marginHorizontal: spacingX._3,
    },
    skeletonGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: spacingY._10,
    },
    skeletonCell: {
        width: '13%',
        aspectRatio: 1,
        backgroundColor: colors.neutral200,
        borderRadius: 10,
        margin: '1%',
    },
    statValue: {
        flex: 1,
        textAlign: 'right',
        alignItems: 'flex-end', // Add this
    },
    valueContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._5,
    },
    inlineIcon: {
        marginLeft: spacingX._3,
    },
});

const CalendarScreenComponent = CalendarScreen;

export default function ProtectedCalendarScreen() {
    return (
        <AuthGuard>
            <CalendarScreenComponent />
        </AuthGuard>
    );
}
