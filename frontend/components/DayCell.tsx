import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import Typo from './Typo';
import * as Icons from 'phosphor-react-native';
import { calculateIntensity, intensityColors, isPartOfStreak } from '@/utils/workoutUtils';

const { width } = Dimensions.get('window');

interface DayCellProps {
    date: Date;
    isCurrentMonth: boolean;
    isToday: boolean;
    hasWorkout: boolean;
    workout?: any;
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
        let cancelled = false;
        
        if (hasWorkout && workout && stats) {
            // Calculate intensity
            if (stats.stats?.volume?.avg_session_volume) {
                calculateIntensity(workout.session_id, stats.stats.volume.avg_session_volume)
                    .then(setIntensity);
            } else {
                setIntensity('medium');
            }

            // Check for PR (simplified - would need stats data)
            setHasPR(false); // TODO: Implement when stats endpoint available

            // Check for streak
            if (stats.stats?.consistency?.current_streak) {
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
    const backgroundColor = hasWorkout ? intensityColors[intensity as keyof typeof intensityColors] || intensityColors.none : colors.white;
    const textColor = hasWorkout && (intensity === 'heavy' || intensity === 'very_heavy') ? colors.white : colors.black;

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
            ]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            {hasPR && (
                <View style={styles.prBadge}>
                    <Icons.Trophy size={10} color={intensityColors.pr_day} weight="fill" />
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

const cellSize = (width - 40 - 30) / 7; // Screen width - padding - calendar padding / 7 days

const styles = StyleSheet.create({
    cell: {
        width: cellSize,
        height: cellSize,
        borderRadius: radius._10,
        alignItems: 'center',
        justifyContent: 'center',
        margin: 2,
        borderWidth: 1,
        borderColor: colors.neutral200,
    },
    todayCell: {
        borderWidth: 2,
        borderColor: colors.primary,
    },
    streakCell: {
        borderWidth: 2,
        borderColor: intensityColors.streak_day,
    },
    prBadge: {
        position: 'absolute',
        top: 2,
        right: 2,
    },
});

export default DayCell;