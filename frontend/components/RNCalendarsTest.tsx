import React, { useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import Typo from './Typo';
import * as Icons from 'phosphor-react-native';
import { intensityColors, isPartOfStreak } from '@/utils/workoutUtils';
import { useTheme } from '@/context/ThemeContext';

interface CalendarItem {
    session_id: string;
    session_name?: string;
    occurred_at?: string;
    volume_kg?: number;
    exercise_count?: number;
    has_pr?: boolean;
    intensity_level?: 'light' | 'medium' | 'heavy' | 'very_heavy';
}

interface RNCalendarsTestProps {
    selectedMonth: Date;
    workouts: Record<string, CalendarItem>;
    stats: any;
    onDayPress: (date: Date) => void;
    onMonthChange: (month: Date) => void;
    isLoading?: boolean; // Add this
}

const RNCalendarsTest: React.FC<RNCalendarsTestProps> = ({
    selectedMonth,
    workouts,
    stats,
    onDayPress,
    onMonthChange,
    isLoading = false, // Add this
}) => {
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [displayMonth, setDisplayMonth] = useState<Date>(selectedMonth); // Track displayed month
    const { colors: themeColors } = useTheme();

    // Update displayMonth only when not loading to prevent premature month name change
    useEffect(() => {
        if (!isLoading) {
            setDisplayMonth(selectedMonth);
        }
    }, [selectedMonth, isLoading]);

    // Format selectedMonth for react-native-calendars
    const currentDate = useMemo(() => {
        const year = selectedMonth.getFullYear();
        const month = String(selectedMonth.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}-01`;
    }, [selectedMonth]);

    // Convert workouts to markedDates format
    const markedDates = useMemo(() => {
        const marked: Record<string, any> = {};
        const today = new Date().toISOString().split('T')[0];

        // Mark all workout days with custom styles
        Object.keys(workouts).forEach((dateKey) => {
            const workout = workouts[dateKey];
            const intensity = workout?.intensity_level || 'medium';
            const hasPR = workout?.has_pr || false;

            // Check for streak
            let isStreakDay = false;
            if (workout && stats?.stats?.consistency?.current_streak) {
                const lastWorkoutDate = workout.occurred_at ? new Date(workout.occurred_at) : undefined;
                const workoutDate = new Date(dateKey);
                isStreakDay = isPartOfStreak(workoutDate, stats.stats.consistency.current_streak, lastWorkoutDate);
            }

            const backgroundColor = intensityColors[intensity as keyof typeof intensityColors] || intensityColors.medium;
            const textColor = (intensity === 'heavy' || intensity === 'very_heavy') ? colors.white : colors.black;

            // Determine border color - only for today, not for PR/streak
            let borderColor = colors.neutral200;
            let borderWidth = 1;

            if (dateKey === today) {
                borderColor = colors.primary || '#FF6B35';
                borderWidth = 2;
            }

            // Use dots for PR and streak indicators instead of borders
            const dots: any[] = [];
            if (hasPR) {
                dots.push({
                    key: 'pr',
                    color: intensityColors.pr_day || colors.green,
                    selectedDotColor: intensityColors.pr_day || colors.green,
                });
            }
            if (isStreakDay) {
                dots.push({
                    key: 'streak',
                    color: intensityColors.streak_day || '#F59E0B',
                    selectedDotColor: intensityColors.streak_day || '#F59E0B',
                });
            }

            marked[dateKey] = {
                customStyles: {
                    container: {
                        backgroundColor: backgroundColor,
                        borderRadius: 999,
                        borderWidth: 0,
                        borderColor: 'transparent',
                        height: 35,
                        width: 35,
                        alignItems: 'center',

                    },
                    text: {
                        color: textColor,
                        fontWeight: dateKey === today ? '700' : '400',
                    },
                },
                marked: true,
                // Add dots for PR and streak - use dotColor for single dot
                ...(hasPR && {
                    dotColor: intensityColors.pr_day || colors.green,
                    selectedDotColor: intensityColors.pr_day || colors.green,
                }),
                ...(isStreakDay && !hasPR && {
                    // If both PR and streak, prioritize PR dot
                    dotColor: intensityColors.streak_day || '#F59E0B',
                    selectedDotColor: intensityColors.streak_day || '#F59E0B',
                }),
            };
        });

        // Mark today if no workout
        if (!marked[today]) {
            marked[today] = {
                customStyles: {
                    container: {
                        backgroundColor: themeColors.accentPrimary, // Add this line
                        borderWidth: 2,
                        borderColor: themeColors.accentPrimary || '#FF6B35',
                        borderRadius: 999,
                        height: 35,
                        width: 35,

                    },
                    text: {
                        fontWeight: '700',
                        color: themeColors.textPrimary,

                    },
                },
            };
        }

        // Mark selected date - this should override workout styling
        if (selectedDate) {
            if (marked[selectedDate]) {
                // If selected date has a workout, override with selected styling
                marked[selectedDate].customStyles = {
                    container: {
                        backgroundColor: themeColors.accentPrimary || '#FF6B35',
                        borderRadius: 999,
                        borderWidth: 0,
                        borderColor: themeColors.accentPrimary || '#FF6B35',
                        width: 35,
                        height: 35,
                    },
                    text: {
                        color: themeColors.textPrimary,
                        fontWeight: '700',
                    },
                };
                // Keep the dot if it exists
                if (marked[selectedDate].dotColor) {
                    // Keep existing dot
                }
            } else {
                // If no workout, just mark as selected
                marked[selectedDate] = {
                    customStyles: {
                        container: {
                            backgroundColor: themeColors.accentPrimary || '#FF6B35',
                            borderRadius: 999,
                            borderWidth: 0,
                            borderColor: themeColors.accentPrimary || '#FF6B35',
                            width: 35,
                            height: 35,
                        },
                        text: {
                            color: themeColors.textPrimary,
                            fontWeight: '700',
                        },
                    },
                };
            }
        }

        return marked;
    }, [workouts, stats, selectedDate, selectedMonth]); // Add selectedMonth to dependencies

    const handleDayPress = (day: DateData) => {
        setSelectedDate(day.dateString);
        const date = new Date(day.dateString);
        onDayPress(date);
    };

    const handleMonthChange = (month: { month: number; year: number }) => {
        const newMonth = new Date(month.year, month.month - 1, 1);
        onMonthChange(newMonth);
    };

    const renderSkeleton = () => {
        return (
            <View style={styles.container}>
                {/* Header Skeleton */}
                <View style={styles.customHeaderWrapper}>
                    <View style={styles.skeletonText} />
                    <View style={styles.skeletonButtons}>
                        <View style={styles.skeletonButton} />
                        <View style={styles.skeletonButton} />
                    </View>
                </View>

                {/* Day Labels Skeleton */}
                <View style={styles.dayLabelsContainer}>
                    {[1, 2, 3, 4, 5, 6, 7].map((_, index) => (
                        <View key={index} style={styles.skeletonDayLabel} />
                    ))}
                </View>

                {/* Calendar Grid Skeleton - Match the actual calendar layout */}
                <View style={styles.skeletonCalendarWrapper}>
                    <View style={styles.skeletonGrid}>
                        {Array.from({ length: 42 }).map((_, index) => (
                            <View key={index} style={styles.skeletonCell} />
                        ))}
                    </View>
                </View>

                {/* Legend Skeleton 
                <View style={styles.legend}>
                    <View style={styles.legendContainer}>
                        {[1, 2, 3, 4].map((_, index) => (
                            <View key={index} style={styles.skeletonLegendItem} />
                        ))}
                    </View>
                    <View style={styles.legendContainer}>
                        {[1, 2].map((_, index) => (
                            <View key={index} style={styles.skeletonLegendItem} />
                        ))}
                    </View>
                </View>*/}
            </View>
        );
    };

    if (isLoading) {
        return renderSkeleton();
    }

    return (
        <View style={[styles.container, { backgroundColor: themeColors.cardBackground }]}>
            {/* Manual Header */}
            <View style={styles.customHeaderWrapper}>
                <View style={styles.monthYearContainer}>
                    {/* Show displayMonth (previous month) during loading to prevent premature update */}
                    {isLoading ? (
                        <View style={{ width: 150, height: 20, backgroundColor: themeColors.cardBackground, borderRadius: 4 }} />
                    ) : (
                        <>
                            <Typo size={18} fontWeight="700" color={themeColors.textPrimary}>
                                {displayMonth.toLocaleDateString('en-US', { month: 'long' })}
                            </Typo>
                            <Typo size={18} fontWeight="400" color={themeColors.textPrimary}>
                                {' '}{displayMonth.toLocaleDateString('en-US', { year: 'numeric' })}
                            </Typo>
                        </>
                    )}
                </View>
                <View style={styles.headerButtons}>
                    <TouchableOpacity
                        onPress={() => {
                            const newMonth = new Date(selectedMonth);
                            newMonth.setMonth(newMonth.getMonth() - 1);
                            onMonthChange(newMonth);
                        }}
                        style={[styles.navButton, { backgroundColor: themeColors.accentPrimary }]}
                    >
                        <Icons.CaretLeft size={20} weight='bold' color={themeColors.background} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => {
                            const newMonth = new Date(selectedMonth);
                            newMonth.setMonth(newMonth.getMonth() + 1);
                            onMonthChange(newMonth);
                        }}
                        style={[styles.navButton, { backgroundColor: themeColors.accentPrimary }]}
                    >
                        <Icons.CaretRight size={20} weight='bold' color={themeColors.background} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Manual Day Labels - Monday to Sunday */}
            <View style={styles.dayLabelsContainer}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
                    const today = new Date();
                    const todayDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
                    // Convert to Monday=0, Tuesday=1, ..., Sunday=6 to match our label array
                    const todayIndex = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;
                    const isToday = index === todayIndex;

                    return (
                        <View key={index} style={[styles.dayLabel, { backgroundColor: themeColors.cardBackground }]}>
                            <Typo
                                size={13}
                                color={isToday ? themeColors.accentPrimary : themeColors.textPrimary || '#FF6B35'}
                                fontWeight="600"
                            >
                                {day}
                            </Typo>
                        </View>
                    );
                })}
            </View>

            {/* Calendar with Skeleton Overlay */}
            <View style={[styles.calendarWrapper, { backgroundColor: themeColors.cardBackground }]}>
                <View style={styles.calendarInnerWrapper}>
                    <Calendar
                        current={currentDate}
                        onDayPress={handleDayPress}
                        onMonthChange={handleMonthChange}
                        markedDates={markedDates}
                        markingType="custom"
                        customHeader={() => <View />}
                        hideArrows={true}
                        hideDayNames={true}
                        firstDay={1}
                        dayComponent={({ date, state, marking }) => {
                            const dateKey = date.dateString;
                            const markedDate = markedDates[dateKey];
                            const customStyles = markedDate?.customStyles;

                            // Check for PR and streak from markedDates
                            const hasPR = markedDate?.dotColor === intensityColors.pr_day || markedDate?.dotColor === colors.green;
                            const hasStreak = markedDate?.dotColor === intensityColors.streak_day || markedDate?.dotColor === '#F59E0B';

                            return (
                                <TouchableOpacity
                                    onPress={() => {
                                        if (state !== 'disabled') {
                                            handleDayPress({ dateString: dateKey } as DateData);
                                        }
                                    }}
                                    style={[
                                        {
                                            flex: 1,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            minHeight: 40,
                                            minWidth: 40,
                                        },
                                        customStyles?.container,
                                    ]}
                                >
                                    <Typo
                                        size={14}
                                        color={
                                            customStyles?.text?.color ||
                                            (state === 'disabled' ? colors.neutral300 : themeColors.textPrimary)
                                        }
                                        fontWeight={customStyles?.text?.fontWeight || '400'}
                                    >
                                        {date.day}
                                    </Typo>

                                    {/* PR Icon */}
                                    {hasPR && (
                                        <View style={styles.iconContainer}>
                                            <Icons.Trophy size={10} weight="fill" color={intensityColors.pr_day || colors.green} />
                                        </View>
                                    )}

                                    {/* Streak Icon (only if no PR) - TEMPORARILY DISABLED
                                    {hasStreak && !hasPR && (
                                        <View style={styles.iconContainer}>
                                            <Icons.Fire size={10} weight="fill" color={intensityColors.streak_day || '#F59E0B'} />
                                        </View>
                                    )} */}
                                </TouchableOpacity>
                            );
                        }}
                        style={[
                            styles.calendar,
                            isLoading && { opacity: 0.3 },
                            { backgroundColor: 'transparent' }
                        ]}
                        theme={{
                            backgroundColor: 'transparent',
                            calendarBackground: 'transparent',
                            textSectionTitleColor: colors.primary || '#FF6B35',
                            selectedDayBackgroundColor: themeColors.accentPrimary || '#FF6B35',
                            selectedDayTextColor: themeColors.background,
                            todayTextColor: colors.primary || '#FF6B35',
                            dayTextColor: colors.black,
                            textDisabledColor: colors.neutral300,
                            dotColor: 'transparent', // Hide default dots since we're using icons
                            selectedDotColor: 'transparent',
                            arrowColor: colors.neutral600,
                            monthTextColor: colors.black,
                            indicatorColor: colors.primary,
                            textDayFontFamily: 'System',
                            textMonthFontFamily: 'System',
                            textDayHeaderFontFamily: 'System',
                            textDayFontWeight: '400',
                            textMonthFontWeight: '600',
                            textDayHeaderFontWeight: '600',
                            textDayFontSize: 14,
                            textMonthFontSize: 18,
                            textDayHeaderFontSize: 12,
                        }}
                        enableSwipeMonths={!isLoading}
                        hideExtraDays={false}
                    />
                    {isLoading && (
                        <View style={styles.skeletonOverlay}>
                            <View style={styles.skeletonGrid}>
                                {Array.from({ length: 42 }).map((_, index) => (
                                    <View key={index} style={styles.skeletonCell} />
                                ))}
                            </View>
                        </View>
                    )}
                </View>
            </View>



            {/* Legend */}
            <View style={styles.legend}>
                <View style={styles.legendContainer}>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: intensityColors.light }]} />
                        <Typo size={10} color={themeColors.textPrimary}>Light</Typo>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: intensityColors.medium }]} />
                        <Typo size={10} color={themeColors.textPrimary}>Medium</Typo>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: intensityColors.heavy }]} />
                        <Typo size={10} color={themeColors.textPrimary}>Heavy</Typo>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: intensityColors.very_heavy }]} />
                        <Typo size={10} color={themeColors.textPrimary}>Very Heavy</Typo>
                    </View>
                </View>

                <View style={styles.legendContainer}>
                    <View style={styles.legendItem}>
                        <Icons.Trophy size={12} weight="fill" color={intensityColors.pr_day || colors.green} />
                        <Typo size={10} color={themeColors.textPrimary}>PR</Typo>
                    </View>
                    {/* Streak Legend - TEMPORARILY DISABLED
                    <View style={styles.legendItem}>
                        <Icons.Fire size={12} weight="fill" color={intensityColors.streak_day || '#F59E0B'} />
                        <Typo size={10} color={themeColors.textPrimary}>Streak</Typo>
                    </View> */}
                </View>


            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {

        borderRadius: radius._20,
        padding: spacingX._15,
        width: '100%',
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
        borderWidth: 1,

    },
    calendar: {
        borderRadius: radius._20,
    },
    // Remove dayContainer, dayContent, and prBadge styles as they're no longer needed
    legend: {
        flexDirection: 'column',
        justifyContent: 'center',
        marginTop: spacingY._15,
        gap: spacingX._15,
    },
    legendContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacingX._15,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._5,
    },
    legendColor: {
        width: 12,
        height: 12,
        borderRadius: 999,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4, // Make it circular
    },
    customHeaderWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacingX._10,
        paddingVertical: spacingY._10,
        marginBottom: spacingY._10,
    },
    monthYearContainer: {
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
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayLabelsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingHorizontal: spacingX._5,
        marginBottom: spacingY._10,
    },
    dayLabel: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacingY._5,

        borderRadius: radius._10,
        marginHorizontal: spacingX._3,
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
    skeletonDayLabel: {
        flex: 1,
        height: 30,
        backgroundColor: colors.neutral200,
        borderRadius: radius._10,
        marginHorizontal: spacingX._3,
    },
    skeletonCalendarWrapper: {
        width: '100%',
        minHeight: 3
    },
    calendarWrapper: {
        width: '100%',
    },
    calendarInnerWrapper: {
        position: 'relative',
        width: '100%',
        overflow: 'visible', // Allow overlay to show
    },
    skeletonOverlay: {
        position: 'absolute',
        top: 0,
        left: spacingX._15,
        right: spacingX._15,
        bottom: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.95)', // Semi-transparent white
        borderRadius: radius._20,
        paddingTop: spacingY._40, // Start after the hidden header area
        paddingHorizontal: spacingX._10,
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        elevation: 20, // High elevation for Android
    },
    skeletonGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        width: '100%',
        justifyContent: 'space-between',
        paddingHorizontal: spacingX._5,
    },
    skeletonCell: {
        width: '13%',
        aspectRatio: 1,
        backgroundColor: colors.neutral200,
        borderRadius: radius._10,
        marginBottom: spacingY._10,
    },
    iconContainer: {
        position: 'absolute',
        bottom: -3,
        right: -3,
        backgroundColor: 'white',
        borderRadius: 10,
        padding: 3,
    },
});

export default RNCalendarsTest;
