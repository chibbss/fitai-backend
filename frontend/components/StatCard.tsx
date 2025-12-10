import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import Typo from './Typo';
import * as Icons from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';

interface StatCardProps {
    value: string;
    label: string;
    icon: keyof typeof Icons;
    highlight?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ value, label, icon, highlight = false }) => {
    const { colors: themeColors } = useTheme();
    const IconComponent = Icons[icon] as React.ComponentType<any>;
    const isTrophy = icon === 'Trophy';

    const content = (
        <View style={styles.content}>
            <View style={[styles.iconContainer, highlight && styles.iconContainerHighlight]}>
                <IconComponent size={24} color={highlight ? colors.white : themeColors.accentPrimary} weight="fill" />
            </View>
            <Typo size={24} fontWeight="700" color={themeColors.textPrimary} style={styles.value}>
                {value}
            </Typo>
            <Typo size={12} color={themeColors.textSecondary}>
                {label}
            </Typo>
        </View>
    );

    if (highlight) {
        return (
            <LinearGradient
                colors={[colors.primaryLight, colors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.card, styles.cardHighlight]}
            >
                {content}
            </LinearGradient>
        );
    }

    return (
        <View style={[
            styles.card,
            { backgroundColor: themeColors.cardBackground },
            isTrophy && {
                borderWidth: 1,
                borderColor: themeColors.accentPrimary,
            }
        ]}>
            {content}
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        flex: 1,
        borderRadius: radius._15,
        padding: spacingX._15,
        minHeight: 100,
    },

    cardHighlight: {
        // Gradient handles background
    },
    content: {
        alignItems: 'center',
        gap: spacingY._5,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: radius._10,
        backgroundColor: 'rgba(168, 168, 168, 0.3)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacingY._5,
    },
    iconContainerHighlight: {
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    value: {
        marginTop: spacingY._5,
    },
});

export default StatCard;