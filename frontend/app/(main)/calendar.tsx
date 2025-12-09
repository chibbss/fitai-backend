import React, { useEffect, useState, useMemo } from 'react';
import {
    View,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    Dimensions,
    Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenWrapper from '@/components/ScreenWrapper';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import { workoutApi } from '@/utils/api';
import Typo from '@/components/Typo';
import * as Icons from 'phosphor-react-native';
import CalendarView from '@/components/CalendarView';
import QuickStatsCards from '@/components/QuickStatsCards';
import StatsSection from '@/components/StatsSection';
import EmptyCalendarState from '@/components/EmptyCalendarState';
const { width } = Dimensions.get('window');

interface CalendarItem {
    session_id: string;
    session_name?: string;
    session_type?: string;
    occurred_at?: string;
    duration_minutes?: number;
    notes?: string;
    metadata: Record<string, any>;
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
    const [workouts, setWorkouts] = useState<CalendarItem[]>([]);
    const [stats, setStats] = useState<WorkoutStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    useEffect(() => {
        fetchData();
    }, [selectedMonth]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // 1. Fetch calendar data for current month
            const startDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
            const endDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);

            const calendarData = await workoutApi.getCalendar(
                startDate.toISOString(),
                endDate.toISOString()
            );
            setWorkouts(calendarData.items || []);

            // 2. Fetch stats (if endpoint available)
            // Use most recent session_id if available
            if (calendarData.items && calendarData.items.length > 0) {
                const mostRecentSessionId = calendarData.items[0].session_id;
                const statsData = await workoutApi.getStats(mostRecentSessionId);
                if (statsData && statsData.stats) {
                    setStats(statsData);
                }
            }
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to load data');
        } finally {
            setIsLoading(false);
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
        const workout = workoutsByDate[dateKey];

        if (workout) {
            // Navigate to insights for this workout
            router.push({
                pathname: '/insights' as any,
                params: { sessionId: workout.session_id },
            });
        } else {
            setSelectedDate(date);
        }
    };

    const handleMonthChange = (newMonth: Date) => {
        setSelectedMonth(newMonth);
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <ScreenWrapper>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Typo size={16} color={colors.neutral600} style={styles.loadingText}>
                            Loading your stats...
                        </Typo>
                    </View>
                </ScreenWrapper>
            </SafeAreaView>
        );
    }

    // Show empty state if no workouts
    if (workouts.length === 0) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <ScreenWrapper showPattern={false}>
                    <View style={styles.whiteBackground}>
                        {/* --- Header --- */}
                        <View style={styles.header}>
                            <TouchableOpacity
                                onPress={() => router.back()}
                                style={styles.backButton}
                            >
                                <Icons.CaretLeft size={26} color={colors.primary} weight="bold" />
                            </TouchableOpacity>

                            <Typo size={24} fontWeight="700" color={colors.black}>
                                Calendar And Stats
                            </Typo>

                            <TouchableOpacity
                                onPress={() => router.push('/workout-log' as any)}
                                style={styles.addButton}
                            >
                                <Icons.Plus size={26} color={colors.primary} weight="bold" />
                            </TouchableOpacity>
                        </View>

                        {/* Empty State */}
                        <EmptyCalendarState 
                            onLogWorkout={() => router.push('/workout-log' as any)}
                            onChatWithAI={() => router.push('/chatscreen' as any)}
                        />
                    </View>
                </ScreenWrapper>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScreenWrapper showPattern={false}>
                <View style={styles.whiteBackground}>
                    {/* --- Header --- */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={styles.backButton}
                        >
                            <Icons.CaretLeft size={26} color={colors.primary} weight="bold" />
                        </TouchableOpacity>

                        <Typo size={24} fontWeight="700" color={colors.black}>
                            Calendar And Stats
                        </Typo>

                        <TouchableOpacity
                            onPress={() => router.push('/workout-log' as any)}
                            style={styles.addButton}
                        >
                            <Icons.Plus size={26} color={colors.primary} weight="bold" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.content}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                    >
                        {/* --- Calendar View --- */}
                        <View style={styles.calendarSection}>
                            <CalendarView
                                selectedMonth={selectedMonth}
                                workouts={workoutsByDate}
                                stats={stats}
                                onDayPress={handleDayPress}
                                onMonthChange={handleMonthChange}
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
                                    stats={[
                                        { label: 'Sessions this week', value: stats.stats.consistency.sessions_this_week.toString() },
                                        { label: 'Sessions this month', value: stats.stats.consistency.sessions_this_month.toString() },
                                        {
                                            label: 'Current streak',
                                            value: `${stats.stats.consistency.current_streak} days 🔥`,
                                            highlight: stats.stats.consistency.current_streak >= 7
                                        },
                                        { label: 'Weekly frequency', value: `${stats.stats.consistency.weekly_frequency}x` },
                                    ]}
                                />

                                {/* --- Volume Stats --- */}
                                <StatsSection
                                    title="Volume"
                                    icon="TrendUp"
                                    stats={[
                                        { label: 'Total volume this week', value: `${(stats.stats.volume.total_volume_week / 1000).toFixed(1)} kg` },

                                         {
                                            label: 'Volume trend',
                                            value: stats.stats.volume.volume_trend,
                                            highlight: stats.stats.volume.volume_trend?.startsWith('+') ?? false
                                        },
                                        { label: 'Avg session', value: `${(stats.stats.volume.avg_session_volume / 1000).toFixed(1)}kg` },
                                        {
                                            label: 'By group',
                                            value: `Push: ${(stats.stats.volume.volume_by_group.push / 1000).toFixed(1)}kg | Pull: ${(stats.stats.volume.volume_by_group.pull / 1000).toFixed(1)}kg | Legs: ${(stats.stats.volume.volume_by_group.legs / 1000).toFixed(1)}kg`
                                        },
                                    ]}
                                />

                                {/* --- Exercises Frequency Stats --- */}
                                <StatsSection
                                    title="Exercises Frequency"
                                    icon="Barbell"
                                    stats={[
                                        ...stats.stats.exercises.top_5.map((ex, idx) => ({
                                            label: `${idx + 1}. ${ex.name}`,
                                            value: `${ex.frequency}x`,
                                        })),
                                        { label: 'Variety', value: `${stats.stats.exercises.variety} unique exercises` },
                                        { label: 'Most trained', value: stats.stats.exercises.most_trained_group },
                                        { label: 'Least trained', value: stats.stats.exercises.least_trained_group },
                                    ]}
                                />

                                {/* --- Recovery Stats --- */}
                                <StatsSection
                                    title="Recovery"
                                    icon="Heart"
                                    stats={[
                                        { label: 'Avg recovery', value: `${stats.stats.recovery.avg_recovery_days} days` },
                                        { label: 'Recovery trend', value: stats.stats.recovery.recovery_trend },
                                        { label: 'Days since last', value: `${stats.stats.recovery.days_since_last} day${stats.stats.recovery.days_since_last !== 1 ? 's' : ''}` },
                                        { label: 'Rest days/week', value: stats.stats.recovery.rest_days_per_week.toString() },
                                    ]}
                                />

                                {/* --- Progress Stats --- */}
                                <StatsSection
                                    title="Progress"
                                    icon="Trophy"
                                    stats={[
                                        {
                                            label: 'PRs this week',
                                            value: `${stats.stats.progress.prs_this_week} 🏆`,
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
                                <Icons.ChartLineUp size={48} color={colors.neutral300} />
                                <Typo size={16} color={colors.neutral600} style={styles.noStatsText}>
                                    Stats will appear here once you log more workouts
                                </Typo>
                                <Typo size={14} color={colors.neutral500} style={styles.noStatsSubtext}>
                                    The stats endpoint is being implemented
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
        backgroundColor: colors.white,
    },
    whiteBackground: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.white,
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
        gap: spacingY._15,
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
    calendarSection: {
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._20,
    },
    quickStatsSection: {
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._20,
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
});

export default CalendarScreen;