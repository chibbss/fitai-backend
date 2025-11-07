import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import Typo from './Typo';
import * as Icons from 'phosphor-react-native';

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
    const IconComponent = Icons[icon] as React.ComponentType<any>;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <IconComponent size={20} color={colors.primary} weight="fill" />
                <Typo size={16} fontWeight="600" color={colors.black} style={styles.title}>
                    {title}
                </Typo>
            </View>
            <View style={styles.statsList}>
                {stats.map((stat, index) => (
                    <View key={index} style={styles.statRow}>
                        <Typo size={14} color={colors.neutral600} style={styles.statLabel}>
                            {stat.label}:
                        </Typo>
                        <Typo
                            size={14}
                            fontWeight={stat.highlight || stat.warning ? '600' : '400'}
                            color={
                                stat.warning
                                    ? colors.rose
                                    : stat.highlight
                                    ? colors.primary
                                    : colors.black
                            }
                            style={styles.statValue}
                        >
                            {stat.value}
                        </Typo>
                    </View>
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.neutral50,
        borderRadius: radius._15,
        padding: spacingX._15,
        marginTop: spacingY._20,
        marginHorizontal: spacingX._20,
        borderWidth: 1,
        borderColor: colors.neutral200,
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
    },
});

export default StatsSection;