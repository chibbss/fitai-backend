import { colors, radius, spacingX } from '@/constants/theme';
import { intensityColors, isPartOfStreak } from '@/utils/workoutUtils';
import React, { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native';
import Typo from './Typo';

// Calculate cell width - must match CalendarView calculation
// CalendarView container has padding: spacingX._15 on all sides
// When used in CollapsibleCalendar, it's inside expandedContainer which also has padding: spacingX._15
// So total horizontal padding = spacingX._15 * 4 (2 from expandedContainer + 2 from CalendarView container)
const { width: screenWidth } = Dimensions.get('window');
const containerHorizontalPadding = spacingX._15 * 4; // Left and right padding from both containers
const cellMargin = 2;
const availableWidth = screenWidth - containerHorizontalPadding;
const columnWidth = availableWidth / 7; // Width for each column slot
const cellWidth = columnWidth - (cellMargin * 2); // Cell width after accounting for left/right margins

interface CalendarItem {
    session_id: string;
    session_name?: string;
    occurred_at?: string;
    volume_kg?: number;
    exercise_count?: number;
    has_pr?: boolean;
    intensity_level?: 'light' | 'medium' | 'heavy' | 'very_heavy';
}

interface DayCellProps {
    date: Date;
    isCurrentMonth: boolean;
    isToday: boolean;
    hasWorkout: boolean;
    workout?: CalendarItem;
    stats?: any;
    onPress: () => void;
}

const DayCell: React.FC<DayCellProps> = ({
    date,
    isCurrentMonth,
    isToday,
    hasWorkout,
    workout,
    stats,
    onPress,
}) => {
    const [intensity, setIntensity] = useState<string>('none');
    const [hasPR, setHasPR] = useState(false);
    const [isStreakDay, setIsStreakDay] = useState(false);

    useEffect(() => {
        if (hasWorkout && workout) {
            // Use intensity_level directly from API (NEW - Phase 1)
            if (workout.intensity_level) {
                setIntensity(workout.intensity_level);
            } else {
                setIntensity('medium'); // Fallback
            }

            // Use has_pr directly from API (NEW - Phase 1)
            setHasPR(workout.has_pr || false);

            // Check for streak (if stats available)
            if (stats?.stats?.consistency?.current_streak) {
                const lastWorkoutDate = workout.occurred_at ? new Date(workout.occurred_at) : undefined;
                setIsStreakDay(isPartOfStreak(date, stats.stats.consistency.current_streak, lastWorkoutDate));
            }
        } else {
            setIntensity('none');
            setHasPR(false);
            setIsStreakDay(false);
        }
    }, [hasWorkout, workout, stats, date]);

    const dayNumber = date.getDate();
    const backgroundColor = hasWorkout 
        ? intensityColors[intensity as keyof typeof intensityColors] || intensityColors.none 
        : colors.white;
    const textColor = hasWorkout && (intensity === 'heavy' || intensity === 'very_heavy') 
        ? colors.white 
        : colors.black;

    return (
        <TouchableOpacity
            style={[
                styles.cell,
                {
                    backgroundColor,
                    opacity: isCurrentMonth ? 1 : 0.3,
                },
                isToday && styles.todayCell,
                isStreakDay && styles.streakCell,
                hasPR && styles.prCell,
            ]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            {hasPR && (
                <View style={styles.prBadge}>
                    <Typo size={12}>🏆</Typo>
                </View>
            )}
            <Typo
                size={14}
                fontWeight={isToday ? '700' : '400'}
                color={textColor}
            >
                {dayNumber}
            </Typo>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    cell: {
        width: cellWidth,
        height: cellWidth, // Make it square
        borderRadius: radius._10,
        alignItems: 'center',
        justifyContent: 'center',
        margin: cellMargin,
        borderWidth: 1,
        borderColor: colors.neutral200,
        position: 'relative',
    },
    todayCell: {
        borderWidth: 2,
        borderColor: colors.primary,
    },
    streakCell: {
        borderWidth: 2,
        borderColor: intensityColors.streak_day,
    },
    prCell: {
        borderWidth: 2,
        borderColor: intensityColors.pr_day || colors.green,
    },
    prBadge: {
        position: 'absolute',
        top: 2,
        right: 2,
    },
});

export default DayCell;