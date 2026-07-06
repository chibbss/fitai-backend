import React from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  interpolateColor,
  useDerivedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { Sun, Moon } from 'phosphor-react-native';
import { radius } from '@/constants/theme';

const ThemeToggleButton = () => {
  const { mode, colors, setPreference } = useTheme();
  const isDark = mode === 'dark';

  // 1. Calculate animation progress (0 for light, 1 for dark)
  const progress = useDerivedValue(() => {
    return withSpring(isDark ? 1 : 0, {
      damping: 15,
      stiffness: 120,
      mass: 0.8
    });
  });

  // 2. Animated style for the sliding thumb
  const thumbStyle = useAnimatedStyle(() => ({
    // Moves the thumb horizontally across the switch (36 units)
    transform: [{ translateX: progress.value * 36 }],
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.accentPrimary, colors.accentSecondary]
    ),
  }));
  // 3. Animated styles for icon scaling and fading
  const sunStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: 1 - progress.value }],
  }));


  const moonStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: progress.value }],
  }));
  const handleToggle = () => {
    setPreference(isDark ? 'light' : 'dark');
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={handleToggle}>
        <Animated.View
          style={[
            styles.switch,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              shadowColor: colors.shadowAccent
            }
          ]}
        >

          <Animated.View style={[styles.thumb, thumbStyle]}>

            <Animated.View style={[styles.iconContainer, sunStyle]}>
              <Sun weight="fill" size={18} color={colors.background} />
            </Animated.View>

            <Animated.View
              style={[
                styles.iconContainer,
                moonStyle,
                StyleSheet.absoluteFill
              ]}
            >
              <Moon weight="fill" size={18} color={colors.background} />
            </Animated.View>

          </Animated.View>

        </Animated.View>
      </Pressable>
    </View>
  )
};

export default ThemeToggleButton;

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
  switch: {
    width: 72,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    padding: 4,
    justifyContent: 'center',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
})