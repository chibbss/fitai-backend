import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import Typo from './Typo';
import * as Icons from 'phosphor-react-native';
import { useTheme } from '@/context/ThemeContext';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, interpolate } from 'react-native-reanimated';

interface StatItem {
    label: string;
    value: string;
    highlight?: boolean;
    warning?: boolean;
}

interface KeyMetric {
    value: string;
    label: string;
    subtitle?: string;
    icon?: keyof typeof Icons;
}

interface StatsSectionProps {
    title: string;
    icon: keyof typeof Icons;
    stats: StatItem[];
    keyMetric?: KeyMetric; // NEW: Key metric to display prominently
    collapsible?: boolean; // New prop to enable collapsible behavior
    defaultExpanded?: boolean; // New prop to set initial state
}

const StatsSection: React.FC<StatsSectionProps> = ({ 
    title, 
    icon, 
    stats,
    keyMetric,
    collapsible = false,
    defaultExpanded = true 
}) => {
    const { colors: themeColors } = useTheme();
    
    // Safely get icon component with fallback
    // Check if icon exists in Icons object, otherwise use a default fallback icon
    const iconExists = icon in Icons && Icons[icon] !== undefined;
    if (!iconExists && __DEV__) {
        console.warn(`Icon "${icon}" not found in Phosphor Icons. Using fallback icon.`);
    }
    const IconComponent = (iconExists ? Icons[icon] : (Icons.Info || Icons.Question)) as React.ComponentType<any>;
    
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    
    // Animation values
    const rotation = useSharedValue(defaultExpanded ? 180 : 0);
    const height = useSharedValue(defaultExpanded ? 1 : 0);

    const toggleExpanded = () => {
        if (!collapsible) return;
        
        const newExpanded = !isExpanded;
        setIsExpanded(newExpanded);
        
        // Animate rotation
        rotation.value = withTiming(newExpanded ? 180 : 0, { duration: 200 });
        // Animate height
        height.value = withTiming(newExpanded ? 1 : 0, { duration: 200 });
    };

    const chevronStyle = useAnimatedStyle(() => {
        return {
            transform: [{ rotate: `${rotation.value}deg` }],
        };
    });

    const contentStyle = useAnimatedStyle(() => {
        const opacity = interpolate(height.value, [0, 1], [0, 1]);
        const maxHeight = interpolate(height.value, [0, 1], [0, 1000]);
        
        return {
            opacity,
            maxHeight,
            overflow: 'hidden' as const,
        };
    });

    const renderValue = (value: string, label?: string, highlight?: boolean) => {
        // Handle null/undefined values
        if (!value || typeof value !== 'string') {
            return (
                <Typo
                    size={14}
                    fontWeight={highlight ? '600' : '400'}
                    color={highlight ? themeColors.accentPrimary : themeColors.textSecondary}
                >
                    N/A
                </Typo>
            );
        }
        
        // Replace N/A with user-friendly alternatives based on context
        let displayValue = value;
        if (value === 'N/A') {
            // Context-aware replacements based on label
            if (label?.toLowerCase().includes('volume trend')) {
                displayValue = 'Track more workouts';
            } else if (label?.toLowerCase().includes('recovery trend')) {
                displayValue = 'Keep logging!';
            } else if (label?.toLowerCase().includes('trend')) {
                displayValue = 'More data needed';
            } else {
                displayValue = '—';
            }
        }
        
        // Check for fire emoji and replace with Flame icon
        if (displayValue.includes('🔥')) {
            const parts = displayValue.split('🔥');
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
        if (displayValue.includes('🏆')) {
            const parts = displayValue.split('🏆');
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
                {displayValue}
            </Typo>
        );
    };

    const headerContent = (
        <View style={[
            styles.header,
            collapsible && !isExpanded && styles.headerNoBorder
        ]}>
            <IconComponent size={20} color={themeColors.accentPrimary} weight="fill" />
            <Typo size={16} fontWeight="600" color={themeColors.textPrimary} style={styles.title}>
                {title}
            </Typo>
            {collapsible && (
                <Animated.View style={chevronStyle}>
                    <Icons.CaretDown size={20} color={themeColors.textSecondary} weight="bold" />
                </Animated.View>
            )}
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: themeColors.cardBackground }]}>
            {collapsible ? (
                <TouchableOpacity onPress={toggleExpanded} activeOpacity={0.7}>
                    {headerContent}
                </TouchableOpacity>
            ) : (
                headerContent
            )}
            <Animated.View style={[collapsible ? contentStyle : {}]}>
                {/* Key Metric Box */}
                {keyMetric && (
                    <View style={[styles.keyMetricBox, { backgroundColor: themeColors.cardBackground }]}>
                        <View style={styles.keyMetricHeader}>
                            {keyMetric.icon && (() => {
                                const KeyMetricIcon = Icons[keyMetric.icon] as React.ComponentType<any>;
                                if (!KeyMetricIcon) return null;
                                return <KeyMetricIcon size={24} color={themeColors.accentPrimary} weight="fill" style={styles.keyMetricIcon} />;
                            })()}
                            <View style={styles.keyMetricValueContainer}>
                                {renderValue(keyMetric.value || '', keyMetric.label, true)}
                            </View>
                        </View>
                        <Typo size={16} fontWeight="500" color={themeColors.textPrimary} style={styles.keyMetricLabel}>
                            {keyMetric.label || ''}
                        </Typo>
                        {keyMetric.subtitle && (
                            <View style={styles.keyMetricSubtitle}>
                                {renderValue(keyMetric.subtitle, keyMetric.label)}
                            </View>
                        )}
                    </View>
                )}
                
                {/* Divider between key metric and secondary stats */}
                {keyMetric && stats.length > 0 && (
                    <View style={[styles.divider, { backgroundColor: themeColors.border || colors.neutral200 }]} />
                )}
                
                {/* Secondary Stats List */}
                <View style={styles.statsList}>
                    {stats.map((stat, index) => (
                        <View key={index} style={styles.statRow}>
                            <Typo size={14} color={themeColors.textSecondary} style={styles.statLabel}>
                                {stat.label}:
                            </Typo>
                            <View style={styles.statValue}>
                                {renderValue(stat.value, stat.label, stat.highlight)}
                            </View>
                        </View>
                    ))}
                </View>
            </Animated.View>
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
    headerNoBorder: {
        borderBottomWidth: 0,
        marginBottom: 0,
        paddingBottom: 0,
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
        alignItems: 'flex-end',
    },
    valueContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._5,
    },
    inlineIcon: {
        marginLeft: spacingX._3,
    },
    keyMetricBox: {
        borderRadius: radius._15,
        padding: spacingX._25,
        marginBottom: spacingY._15,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 120,
    },
    keyMetricHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacingX._10,
        marginBottom: spacingY._10,
    },
    keyMetricIcon: {
        marginRight: spacingX._5,
    },
    keyMetricValueContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    keyMetricValue: {
        // Value is now in header, no margin needed
    },
    keyMetricLabel: {
        marginBottom: spacingY._5,
    },
    keyMetricSubtitle: {
        alignItems: 'center',
    },
    divider: {
        height: 1,
        marginVertical: spacingY._17,
        marginHorizontal: spacingX._20,
    },
});

export default StatsSection;