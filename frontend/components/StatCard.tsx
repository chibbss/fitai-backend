import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import Typo from './Typo';
import * as Icons from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface StatCardProps {
    value: string;
    label: string;
    icon: keyof typeof Icons;
    highlight?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ value, label, icon, highlight = false }) => {
    const IconComponent = Icons[icon] as React.ComponentType<any>;

    const content = (
        <View style={styles.content}>
            <View style={[styles.iconContainer, highlight && styles.iconContainerHighlight]}>
                <IconComponent size={24} color={highlight ? colors.white : colors.primary} weight="fill" />
            </View>
            <Typo size={24} fontWeight="700" color={colors.black} style={styles.value}>
                {value}
            </Typo>
            <Typo size={12} color={colors.neutral600}>
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
        <View style={[styles.card, styles.cardNormal]}>
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
    cardNormal: {
        backgroundColor: colors.neutral50,
        borderWidth: 1,
        borderColor: colors.neutral200,
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
        backgroundColor: colors.primaryLight,
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