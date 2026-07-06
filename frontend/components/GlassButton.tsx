import React from "react";
import { StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Typo from './Typo';
import { colors, radius } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

type GlassButtonProps = {
    label: string;
    onPress: () => void;
    isSelected?: boolean;
    icon?: React.ReactNode;
    style?: any;
}

const GlassButton = ({ label, onPress, isSelected, icon, style }: GlassButtonProps) => {
    const { mode, colors: themeColors } = useTheme();
    const isDarkMode = mode === 'dark';
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: isSelected ? withSpring(1.05) : withSpring(1) }],
        borderColor: isSelected ? themeColors.accentPrimary : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
        backgroundColor: isSelected ? themeColors.accentPrimary : (isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'),
    }));

    return (
        <AnimatedTouchable
            onPress={onPress}
            onPressIn={() => (scale.value = withSpring(0.95))}
            onPressOut={() => (scale.value = withSpring(1))}
            style={[styles.button, animatedStyle, style]}
        >
            {icon}
            <Typo
                size={18}
                fontWeight={isSelected ? "700" : "500"}
                color={isSelected ? themeColors.background : colors.neutral700}
                style={{ marginLeft: icon ? 10 : 0 }}
            >
                {label}
            </Typo>
        </AnimatedTouchable>
    );
};

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: radius._10,
        borderWidth: 1,
        marginVertical: 8,
        // Glass Shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    }
})

export default GlassButton;