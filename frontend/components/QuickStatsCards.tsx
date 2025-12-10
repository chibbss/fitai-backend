import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import StatCard from './StatCard';

interface QuickStatsCardsProps {
    stats: {
        consistency: {
            sessions_this_week: number;
            current_streak: number;
        };
        progress: {
            prs_this_week: number;
        };
    };
}

const QuickStatsCards: React.FC<QuickStatsCardsProps> = ({ stats }) => {
    return (
        <View style={styles.container}>
            <StatCard
                value={stats.consistency.sessions_this_week.toString()}
                label="This Week"
                icon="Calendar"
                highlight={false}
            />
            <StatCard
                value={stats.consistency.current_streak.toString()}
                label="Streak"
                icon="Pulse"
                highlight={stats.consistency.current_streak >= 7}
            />
            <StatCard
                value={stats.progress.prs_this_week.toString()}
                label="PRs"
                icon="Trophy"
                highlight={false}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        gap: spacingX._20,
    },
});

export default QuickStatsCards;