import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import CalendarView from './CalendarView';

interface CollapsibleCalendarProps {
    selectedMonth: Date;
    workouts: Record<string, any>;
    stats: any;
    onDayPress: (date: Date) => void;
    onMonthChange: (month: Date) => void;
}

const CollapsibleCalendar: React.FC<CollapsibleCalendarProps> = ({
    selectedMonth,
    workouts,
    stats,
    onDayPress,
    onMonthChange,
}) => {
    return (
        <View style={styles.container}>
            <View style={styles.calendarContainer}>
                <CalendarView
                    selectedMonth={selectedMonth}
                    workouts={workouts}
                    stats={stats}
                    onDayPress={onDayPress}
                    onMonthChange={onMonthChange}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    calendarContainer: {
        backgroundColor: colors.neutral50,
        borderRadius: radius._30,
        padding: spacingX._15,
    },
});

export default CollapsibleCalendar;
