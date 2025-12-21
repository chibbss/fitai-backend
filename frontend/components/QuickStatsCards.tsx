import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import Typo from './Typo';
import * as Icons from 'phosphor-react-native';
import { useTheme } from '@/context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';

interface QuickStatsCardsProps {
    stats: {
        consistency: {
            sessions_this_week: number;
            current_streak: number;
            best_streak: number;
        };
        progress: {
            prs_this_week: number;
            prs_this_month: number;
        };
        volume: {
            total_volume_week: number;
            volume_trend: string;
        };
    };
}

const QuickStatsCards: React.FC<QuickStatsCardsProps> = ({ stats }) => {
    const { colors: themeColors } = useTheme();
    
    // Hero Card Component
    const HeroCard: React.FC<{
        value: string;
        label: string;
        subtitle?: string;
        icon: keyof typeof Icons;
        iconEmoji?: string;
        highlight?: boolean;
    }> = ({ value, label, subtitle, icon, iconEmoji, highlight = false }) => {
        const IconComponent = Icons[icon] as React.ComponentType<any>;
        
        const content = (
            <View style={styles.heroCardContent}>
                {/* Icon positioned in top right */}
                <View style={styles.iconContainer}>
                    {iconEmoji ? (
                        <Typo size={32} fontWeight="700" color={themeColors.textPrimary}>
                            {iconEmoji}
                        </Typo>
                    ) : (
                        <IconComponent 
                            size={28} 
                            color={highlight ? colors.white : themeColors.accentPrimary} 
                            weight="fill" 
                        />
                    )}
                </View>
                
                {/* Main content */}
                <View style={styles.heroMainContent}>
                    <Typo size={36} fontWeight="700" color={highlight ? colors.white : themeColors.textPrimary} style={styles.heroValue}>
                        {value}
                    </Typo>
                    <Typo size={16} fontWeight="500" color={highlight ? colors.white : themeColors.textPrimary} style={styles.heroLabel}>
                        {label}
                    </Typo>
                    {subtitle && (
                        <Typo size={12} color={highlight ? 'rgba(255, 255, 255, 0.8)' : themeColors.textSecondary} style={styles.heroSubtitle}>
                            {subtitle}
                        </Typo>
                    )}
                </View>
            </View>
        );

        if (highlight) {
            return (
                <LinearGradient
                    colors={[colors.primaryLight, colors.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.heroCard, styles.heroCardHighlight]}
                >
                    {content}
                </LinearGradient>
            );
        }

        return (
            <View style={[styles.heroCard, { backgroundColor: themeColors.cardBackground }]}>
                {content}
            </View>
        );
    };

    // Summary Card Component
    const SummaryCard: React.FC<{
        sessions: number;
        volume: number;
        trend: string;
    }> = ({ sessions, volume, trend }) => {
        const isPositiveTrend = trend?.includes('+') || trend?.startsWith('+');
        const trendColor = isPositiveTrend ? colors.primary : themeColors.textSecondary;
        
        return (
            <View style={[styles.summaryCard, { backgroundColor: themeColors.cardBackground }]}>
                <View style={styles.summaryRow}>
                    <View style={styles.summaryItem}>
                        <Typo size={24} fontWeight="700" color={themeColors.textPrimary}>
                            {sessions}
                        </Typo>
                        <Typo size={12} color={themeColors.textSecondary}>
                            Sessions
                        </Typo>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                        <Typo size={24} fontWeight="700" color={themeColors.textPrimary}>
                            {(volume / 1000).toFixed(1)} kg
                        </Typo>
                        <Typo size={12} color={themeColors.textSecondary}>
                            Volume
                        </Typo>
                    </View>
                </View>
                {trend && (
                    <View style={styles.summaryTrend}>
                        <View style={styles.trendContainer}>
                            <Typo size={14} fontWeight="600" color={trendColor}>
                                {trend}
                            </Typo>
                            {isPositiveTrend && (
                                <Icons.TrendUp size={14} color={trendColor} weight="fill" style={styles.trendIcon} />
                            )}
                        </View>
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={styles.wrapper}>
            <View style={styles.container}>
                {/* Hero Card 1: Streak */}
                <HeroCard
                    value={stats.consistency.current_streak.toString()}
                    label="Day Streak"
                    subtitle={`Best: ${stats.consistency.best_streak} days`}
                    icon="Flame"
                    highlight={stats.consistency.current_streak >= 7}
                />
                
                {/* Hero Card 2: PRs */}
                <HeroCard
                    value={stats.progress.prs_this_week.toString()}
                    label="PRs This Week"
                    subtitle={`${stats.progress.prs_this_month} PRs this month`}
                    icon="Trophy"
                    highlight={false}
                />
            </View>
            
            {/* Summary Card: Sessions + Volume */}
            <SummaryCard
                sessions={stats.consistency.sessions_this_week}
                volume={stats.volume.total_volume_week}
                trend={stats.volume.volume_trend}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        width: '100%',
    },
    container: {
        flexDirection: 'row',
        gap: spacingX._20,
    },
    heroCard: {
        flex: 1,
        minHeight: 140,
        borderRadius: radius._12,
        padding: 15,
    },
    heroCardHighlight: {
        // No border for highlight
    },
    heroCardContent: {
        flex: 1,
        position: 'relative',
    },
    iconContainer: {
        position: 'absolute',
        top: 0,
        right: 0,
        zIndex: 1,
    },
    heroMainContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacingY._5,
        paddingTop: spacingY._7,
    },
    heroValue: {
        // No margin needed, gap handles spacing
    },
    heroLabel: {
        // No margin needed, gap handles spacing
    },
    heroSubtitle: {
        marginTop: spacingY._5,
    },
    summaryCard: {
        width: '100%',
        borderRadius: radius._15,
        padding: spacingX._20,
        marginTop: spacingY._20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    summaryItem: {
        flex: 1,
        alignItems: 'center',
        gap: spacingY._5,
    },
    summaryDivider: {
        width: 1,
        height: 40,
        backgroundColor: colors.neutral200,
        marginHorizontal: spacingX._20,
    },
    summaryTrend: {
        marginTop: spacingY._12,
        alignItems: 'center',
    },
    trendContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._5,
    },
    trendIcon: {
        marginLeft: spacingX._3,
    },
});

export default QuickStatsCards;