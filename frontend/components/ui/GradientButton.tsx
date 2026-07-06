import Typo from '@/components/Typo';
import { radius } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { verticalScale } from '@/utils/styling';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';

type Props = {
    title: string;
    onPress?: () => void;
    loading?: boolean;
    disabled?: boolean;
    variant?: 'solid' | 'gradient' | 'outline';
    style?: StyleProp<ViewStyle>;
};

const GradientButton = ({ title, onPress, loading,
    disabled, variant = 'solid', style }: Props) => {
    const { colors } = useTheme();
    const isDisabled = disabled || loading;
    const fg = variant === 'outline' ? colors.textPrimary : colors.textOnAccent;

    const content = loading
        ? <ActivityIndicator color={fg} />
        : <Typo size={16} fontWeight="700" color={fg}>{title}</Typo>;

    if (variant === 'gradient') {
        return (
            <TouchableOpacity
                onPress={onPress} disabled={isDisabled} activeOpacity={0.85}
                style={[{ opacity: isDisabled ? 0.5 : 1 }, style]}
            >
                <LinearGradient
                    colors={colors.accentGradient as [string, string]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.btn}>
                    {content}
                </LinearGradient>
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity onPress={onPress} disabled={isDisabled} activeOpacity={0.85}
            style={[
                styles.btn,
                variant === 'outline'
                    ? { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: 'transparent' }
                    : { backgroundColor: colors.accent },
                { opacity: isDisabled ? 0.5 : 1 },
                style,
            ]}>
            {content}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    btn: {
        height: verticalScale(54),
        borderRadius: radius._17,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
});

export default GradientButton;