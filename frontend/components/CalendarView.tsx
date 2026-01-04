import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import Typo from './Typo';
import * as Icons from 'phosphor-react-native';
import DayCell from './DayCell';
import { calculateIntensity, intensityColors } from '@/utils/workoutUtils';

const { width: screenWidth } = Dimensions.get('window');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Calculate cell width - must match exactly between labels and cells
// CalendarView container has padding: spacingX._15 on all sides
// When used in CollapsibleCalendar, it's inside expandedContainer which also has padding: spacingX._15
// So total horizontal padding = spacingX._15 * 4 (2 from expandedContainer + 2 from CalendarView container)
const containerHorizontalPadding = spacingX._15 * 4; // Left and right padding from both containers
const cellMargin = 2;
const availableWidth = screenWidth - containerHorizontalPadding;
// Each column gets exactly 1/7th of available width
const columnWidth = availableWidth / 7; // Width for each column slot
const cellWidth = columnWidth - (cellMargin * 2); // Cell width after accounting for left/right margins

interface CalendarViewProps {
    selectedMonth: Date;
    workouts: Record<string, any>;
    stats: any;
    onDayPress: (date: Date) => void;
    onMonthChange: (month: Date) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({
    selectedMonth,
    workouts,
    stats,
    onDayPress,
    onMonthChange,
}) => {
    const calendarDays = useMemo(() => {
        const year = selectedMonth.getFullYear();

        const month = selectedMonth.getMonth();

        // First day of month
        const firstDay = new Date(year, month, 1);
        // getDay() returns 0=Sunday, 1=Monday, ..., 6=Saturday
        // Use directly for Sunday-Saturday calendar display
        const firstDayOfWeek = firstDay.getDay(); // 0=Sunday, 6=Saturday

        // Last day of month
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();

        const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

        // Add days from previous month to fill first week (Sunday to Saturday)
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            days.push({
                date: new Date(year, month - 1, prevMonthLastDay - i),
                isCurrentMonth: false,
            });
        }

        // Add days of current month
        for (let day = 1; day <= daysInMonth; day++) {
            days.push({
                date: new Date(year, month, day),
                isCurrentMonth: true,
            });
        }

        // Add days from next month to fill last week
        const remainingDays = 42 - days.length; // 6 weeks * 7 days
        for (let day = 1; day <= remainingDays; day++) {
            days.push({
                date: new Date(year, month + 1, day),
                isCurrentMonth: false,
            });
        }

        return days;
    }, [selectedMonth]);

    const monthName = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const handlePrevMonth = () => {
        const newMonth = new Date(selectedMonth);
        newMonth.setMonth(newMonth.getMonth() - 1);
        onMonthChange(newMonth);
    };

    const handleNextMonth = () => {
        const newMonth = new Date(selectedMonth);
        newMonth.setMonth(newMonth.getMonth() + 1);
        onMonthChange(newMonth);
    };

    const getIntensityForDay = async (date: Date): Promise<string> => {
        const dateKey = date.toISOString().split('T')[0];
        const workout = workouts[dateKey];

        if (!workout) return 'none';

        if (stats?.stats?.volume?.avg_session_volume) {
            const intensity = await calculateIntensity(
                workout.session_id,
                stats.stats.volume.avg_session_volume
            );
            return intensity;
        }

        return 'medium'; // Default if no stats
    };

    return (
        <View style={styles.container}>
            {/* ---Month Header --- */}
            <View style={styles.monthHeader}>
                <TouchableOpacity onPress={handlePrevMonth} style={styles.monthButton}>
                    <Icons.CaretLeft size={20} color={colors.neutral600} />
                </TouchableOpacity>
                <Typo size={18} fontWeight="600" color={colors.black}>
                    {monthName}
                </Typo>
                <TouchableOpacity onPress={handleNextMonth} style={styles.monthButton}>
                    <Icons.CaretRight size={20} color={colors.neutral600} />
                </TouchableOpacity>
            </View>

            {/* Day Labels */}
            <View style={styles.dayLabels}>
                {DAYS.map(day => (
                    <View key={day} style={[styles.dayLabel, { width: columnWidth }]}>
                        <Typo size={12} color={colors.neutral500} fontWeight="600">
                            {day}
                        </Typo>
                    </View>
                ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
                {calendarDays.map((day, index) => {
                    const dateKey = day.date.toISOString().split('T')[0];
                    const workout = workouts[dateKey];
                    const isToday = day.date.toDateString() === new Date().toDateString();

                    return (
                        <DayCell
                            key={index}
                            date={day.date}
                            isCurrentMonth={day.isCurrentMonth}
                            isToday={isToday}
                            hasWorkout={!!workout}
                            workout={workout}
                            stats={stats}
                            onPress={() => onDayPress(day.date)}
                        />
                    );
                })}
            </View>

             {/* Legend */}
             <View style={styles.legend}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendColor, { backgroundColor: intensityColors.light }]} />
                    <Typo size={10} color={colors.neutral600}>Light</Typo>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendColor, { backgroundColor: intensityColors.medium }]} />
                    <Typo size={10} color={colors.neutral600}>Medium</Typo>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendColor, { backgroundColor: intensityColors.heavy }]} />
                    <Typo size={10} color={colors.neutral600}>Heavy</Typo>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendColor, { backgroundColor: intensityColors.very_heavy }]} />
                    <Typo size={10} color={colors.neutral600}>Very Heavy</Typo>
                </View>
            </View>
        </View>
    )
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.neutral50,
        borderRadius: radius._30,
        padding: spacingX._15,
    },
    monthHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacingY._15,
    },
    monthButton: {
        padding: spacingX._5,
    },
    dayLabels: {
        flexDirection: 'row',
        marginBottom: spacingY._10,
        width: '100%',
    },
    dayLabel: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        width: '100%',
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: spacingY._15,
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
        borderRadius: radius._3,
    },
});

export default React.memo(CalendarView);