import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import Typo from './Typo';
import * as Icons from 'phosphor-react-native';
import { useTheme } from '@/context/ThemeContext';

interface StatItem {
    label: string;
    value: string;
    highlight?: boolean;
    warning?: boolean;
}

interface StatsSectionProps {
    title: string;
    icon: keyof typeof Icons;
    stats: StatItem[];
}

const StatsSection: React.FC<StatsSectionProps> = ({ title, icon, stats }) => {
    const { colors: themeColors } = useTheme();
    const IconComponent = Icons[icon] as React.ComponentType<any>;

    const renderValue = (value: string, highlight?: boolean) => {
        // Check for fire emoji and replace with Flame icon
        if (value.includes('🔥')) {
            const parts = value.split('🔥');
            return (
                <View style={styles.valueContainer}>
                    <Typo
                        size={14}
                        fontWeight={highlight ? '600' : '400'}
                        color={highlight ? themeColors.accentPrimary : themeColors.textSecondary}
                    >
                        {parts[0].trim()}
                    </Typo>
                    <Icons.Flame size={14} color={highlight ? themeColors.accentWarm : themeColors.accentPrimary} weight="fill" style={styles.inlineIcon} />
                </View>
            );
        }
        
        // Check for trophy emoji and replace with Trophy icon
        if (value.includes('🏆')) {
            const parts = value.split('🏆');
            return (
                <View style={styles.valueContainer}>
                    <Typo
                        size={14}
                        fontWeight={highlight ? '600' : '400'}
                        color={highlight ? themeColors.accentPrimary : themeColors.textSecondary}
                    >
                        {parts[0].trim()}
                    </Typo>
                    <Icons.Trophy size={14} color={highlight ? themeColors.accentPrimary : themeColors.accentPrimary} weight="fill" style={styles.inlineIcon} />
                </View>
            );
        }

        // Default: render as text
        return (
            <Typo
                size={14}
                fontWeight={highlight ? '600' : '400'}
                color={highlight ? themeColors.accentPrimary : themeColors.textSecondary}
            >
                {value}
            </Typo>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: themeColors.cardBackground }]}>
            <View style={styles.header}>
                <IconComponent size={20} color={themeColors.accentPrimary} weight="fill" />
                <Typo size={16} fontWeight="600" color={themeColors.textPrimary} style={styles.title}>
                    {title}
                </Typo>
            </View>
            <View style={styles.statsList}>
                {stats.map((stat, index) => (
                    <View key={index} style={styles.statRow}>
                        <Typo size={14} color={themeColors.textSecondary} style={styles.statLabel}>
                            {stat.label}:
                        </Typo>
                        <View style={styles.statValue}>
                            {renderValue(stat.value, stat.highlight)}
                        </View>
                    </View>
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        
        borderRadius: radius._15,
        padding: spacingX._15,
        marginTop: spacingY._20,
        marginHorizontal: spacingX._20,
        borderWidth: 1,
        
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._10,
        marginBottom: spacingY._15,
        paddingBottom: spacingY._10,
        borderBottomWidth: 1,
        borderBottomColor: colors.neutral200,
    },
    title: {
        flex: 1,
    },
    statsList: {
        gap: spacingY._10,
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statLabel: {
        flex: 1,
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

export default StatsSection;