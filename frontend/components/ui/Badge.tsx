import Typo from '@/components/Typo';
import { radius, spacingX } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import React from 'react';
import { StyleSheet, View } from 'react-native';

type Tone = 'teal' | 'gold' | 'neutral' | 'danger';

type Props = {
    label: string;
    tone?: Tone;
    icon?: React.ReactNode;
};

const Badges = ({ label, tone = 'teal', icon }: Props) => {
    const { colors } = useTheme();
    const tones: Record<Tone, { fg: string; bg: string }> = {
        teal: { fg: colors.accentBright, bg: colors.accentDim },
        gold: { fg: colors.gold, bg: 'rgba(251,191,36,0.15)' },
        neutral: { fg: colors.textSecondary, bg: colors.cardElevated },
        danger: { fg: colors.danger, bg: 'rgba(239,68,68,0.15)' },
    };
    const c = tones[tone];

    return (
        <View style={[styles.badge, { backgroundColor: c.bg }]}>
            {icon}
            <Typo size={12} fontWeight="700" color={c.fg}>{label}</Typo>
        </View>
    );
};

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: spacingX._10,
        paddingVertical: 4,
        borderRadius: radius.full,
        alignSelf: 'flex-start',
    },
});

export default Badges;