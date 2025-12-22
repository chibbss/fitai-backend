import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import { workoutApi } from '@/utils/api';
import React, { useEffect, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Typo from './Typo';
import * as Icons from 'phosphor-react-native';
const { width } = Dimensions.get('window');
import { useTheme } from '@/context/ThemeContext';
import { invalidateCache, getCachedUserData } from '@/utils/dataCache';
import { useAuth } from '@/context/AuthContext';
import { logger } from '@/utils/logger';

interface DayData {
    date: string;
    day_name: string;
    day_number: number;
    has_workout: boolean;
    session_id: string | null;
    session_name?: string;
    volume_kg: number;
    intensity_level: 'light' | 'medium' | 'heavy' | 'very_heavy' | null;
    has_pr: boolean;
    exercise_count: number;
}

interface WeeklySummaryData {
    days: DayData[];
    week_start: string;
    week_end: string;
    is_current_week: boolean;
}

interface WeeklySummaryStripProps {
    weekStartDate: string; // ISO date for Monday
    onDayPress: (sessionId: string | null, date: string) => void;
    onWeekChange: (newWeekStart: string) => void;
    refreshKey?: number; // Add this - increment to trigger refresh
}

const WeeklySummaryStrip: React.FC<WeeklySummaryStripProps> = ({
    weekStartDate,
    onDayPress,
    onWeekChange,
    refreshKey,
}) => {
    const { colors: themeColors } = useTheme();
    const { user } = useAuth();
    const [weekData, setWeekData] = useState<WeeklySummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [scrollX, setScrollX] = useState(0);

    // Load cached data first (instant UX)
    useEffect(() => {
        const loadCachedData = async () => {
            if (!user?.id) return;
            
            try {
                const cacheKey = `weeklySummary_${weekStartDate || 'current'}`;
                const cached = await getCachedUserData<WeeklySummaryData>(user.id, cacheKey);
                if (cached) {
                    setWeekData(cached);
                    logger.log(`[WeeklySummary] Loaded cached data for ${weekStartDate || 'current'}`);
                    setLoading(false); // Show cached data immediately
                }
            } catch (error) {
                logger.error('[WeeklySummary] Error loading cached data:', error);
            }
        };
        
        loadCachedData();
    }, [user?.id, weekStartDate]);

    // Always fetch from backend (ensures freshness)
    useEffect(() => {
        fetchWeekData(weekStartDate);
    }, [weekStartDate, refreshKey]);

    const fetchWeekData = async (startDate: string) => {
        // Don't set loading to true if we already have cached data (prevents flash)
        if (!weekData) {
            setLoading(true);
        }
        
        try {
            // This will fetch fresh data from backend (API handles cache internally)
            const data = await workoutApi.getWeeklySummary(startDate);
            setWeekData(data);
            logger.log(`[WeeklySummary] Fetched fresh data from backend for ${startDate || 'current'}`);
        } catch (error: any) {
            logger.error('[WeeklySummary] Failed to fetch weekly summary:', error);
            // If we have cached data, keep showing it even if backend fails
            if (!weekData) {
                // No cache and backend failed - show error state
                setWeekData(null);
            }
        } finally {
            setLoading(false);
        }
    };

    const getIntensityEmoji = (intensity: string | null, hasPr: boolean): string => {
        if (hasPr) return 'trophy';
        if (intensity === 'heavy' || intensity === 'very_heavy') return 'flame';
        if (intensity === 'light' || intensity === 'medium') return 'circle';
        return '';
    };

    const handleSwipe = (direction: 'left' | 'right') => {
        if (!weekData) return;

        const currentDate = new Date(weekStartDate);
        const daysToAdd = direction === 'left' ? 7 : -7;
        const newDate = new Date(currentDate);
        newDate.setDate(currentDate.getDate() + daysToAdd);

        // Get Monday of the new week
        const day = newDate.getDay();
        const diff = newDate.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        const monday = new Date(newDate.setDate(diff));
        const mondayISO = monday.toISOString().split('T')[0];

        onWeekChange(mondayISO);
    };

    const formatWeekRange = (weekStart: string, weekEnd: string): string => {
        const start = new Date(weekStart);
        const end = new Date(weekEnd);
        const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
        const endMonth = end.toLocaleDateString('en-US', { month: 'short' });

        if (startMonth === endMonth) {
            return `${startMonth} ${start.getDate()}-${end.getDate()}`;
        }
        return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
    };

    // Skeleton loader component
    const renderSkeleton = () => {
        return (
            <View style={[styles.container, { backgroundColor: themeColors.background }]}>
                {/* Header Skeleton */}
                <View style={styles.header}>
                    <View style={styles.skeletonText} />
                    <View style={styles.skeletonButtons}>
                        <View style={styles.skeletonButton} />
                        <View style={styles.skeletonButton} />
                    </View>
                </View>

                {/* Days Skeleton */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    style={styles.scrollView}
                >
                    {[1, 2, 3, 4, 5, 6, 7].map((_, index) => (
                        <View key={index} style={styles.skeletonDayCard} />
                    ))}
                </ScrollView>
            </View>
        );
    };

    if (loading || !weekData) {
        return renderSkeleton();
    }

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
            {/* Header with swipe controls */}
            <View style={styles.header}>

                <View style={styles.headerLeft}>
                    <Typo size={18} fontWeight="700" color={themeColors.textPrimary}>
                        {weekData.is_current_week ? 'This Week' : formatWeekRange(weekData.week_start, weekData.week_end)}
                    </Typo>
                </View>

                <View style={styles.headerButtons}>
                    <TouchableOpacity
                        onPress={() => handleSwipe('right')}
                        style={styles.navButton}
                    >
                        <Icons.CaretLeft size={20} weight='bold' color={themeColors.accentPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => handleSwipe('left')}
                        style={styles.navButton}
                    >
                        <Icons.CaretRight size={20} weight='bold' color={themeColors.accentPrimary} />
                    </TouchableOpacity>
                </View>


            </View>

            {/* Days scroll view */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                style={styles.scrollView}
            >
                {weekData.days.map((day, index) => {
                    const emoji = getIntensityEmoji(day.intensity_level, day.has_pr);

                    return (
                        <TouchableOpacity
                            key={index}
                            style={[
                                styles.dayCard,
                                {
                                    backgroundColor: themeColors.cardBackground,

                                },
                                !day.has_workout && styles.restDayCard,
                            ]}
                            onPress={() => onDayPress(day.session_id, day.date)}
                            activeOpacity={0.7}
                        >
                            {emoji && (
                                        <View style={styles.badgeContainer}>
                                            {emoji === 'trophy' ? (
                                                <Icons.Trophy size={18} color={colors.primary} weight="fill" />
                                            ) : emoji === 'flame' ? (
                                                <Icons.Flame size={18} color={themeColors.accentWarm} weight="fill" />
                                            ) : emoji === 'circle' ? (
                                                <Icons.CircleIcon size={18} color={themeColors.accentPrimary} weight="fill" />
                                            ) : (
                                                <Typo size={16}>{emoji}</Typo>
                                            )}
                                        </View>
                                    )}
                            <Typo size={14} fontWeight="600" color={themeColors.textSecondary}>
                                {day.day_name}
                            </Typo>
                            <Typo size={18} fontWeight="700" color={themeColors.textSecondary}>
                                {day.day_number}
                            </Typo>

                            {day.has_workout ? (
                                <>
                                    {day.session_name && (
                                        <Typo
                                            size={10}
                                            color={themeColors.textSecondary}
                                            textProps={{ numberOfLines: 1 }}
                                            style={styles.workoutName}
                                        >
                                            {day.session_name}
                                        </Typo>
                                    )}
                                    
                                    {day.volume_kg > 0 && (
                                        <Typo size={12} color={themeColors.textSecondary}>
                                            {day.volume_kg.toFixed(1)}kg
                                        </Typo>
                                    )}
                                </>
                            ) : (
                                <Typo size={12} color={colors.neutral400}>
                                    Rest
                                </Typo>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: spacingY._15,
        paddingHorizontal: spacingX._20,

    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacingY._10,
        paddingHorizontal: spacingX._10,
        marginBottom: spacingY._10,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._10,
    },
    navButton: {
        width: 40,
        height: 40,

        borderColor: colors.primary || '#FF6B35',
        alignItems: 'center',
        justifyContent: 'center',

    },
    swipeButton: {
        padding: spacingX._5,
        minWidth: 30,
        alignItems: 'center',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    scrollView: {
        flexGrow: 0,
    },
    scrollContent: {
        paddingRight: spacingX._20,
        gap: spacingX._15,
    },
    dayCard: {
        width: 100,
        minHeight: 100,
        borderRadius: radius._12,
        padding: 15,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        gap: spacingY._5,
        position: 'relative',
    },
    restDayCard: {
        opacity: 0.6,
    },
    badgeContainer: {
        
        position: 'absolute',
        top: spacingX._5, 
        right: spacingX._5,
    },
    workoutName: {
        textAlign: 'center',
        maxWidth: 70,
    },
    skeletonText: {
        width: 150,
        height: 20,
        backgroundColor: colors.neutral200,
        borderRadius: radius._6,
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
    skeletonDayCard: {
        width: 100,
        minHeight: 105,
        backgroundColor: colors.neutral200,
        borderRadius: radius._12,

        padding: spacingX._10,
    },
});

export default WeeklySummaryStrip;