import React, { useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { Easing } from 'react-native-reanimated';


const toggleAsset = require('@/assets/sun-moon.png');

const ThemeToggleButton = () => {
  const { mode, colors, setPreference } = useTheme();
  const isDark = mode === 'dark';

  
  const rotation = useSharedValue(isDark ? 180 : 0);

  useEffect(() => {
    rotation.value = withTiming(isDark ? 180 : 0, { duration: 500 });
  }, [isDark, rotation]);

  const animatedImage = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handleToggle = () => {
    setPreference(isDark ? 'light' : 'dark');
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleToggle}
        style={[
          styles.switch,
          {
            backgroundColor: colors.surface,
            shadowColor: colors.shadowAccent ?? '#000',
          },
        ]}
      >
        <Animated.Image source={toggleAsset} style={[styles.image, animatedImage]} />
      </TouchableOpacity>
    </View>
  );
};

export default ThemeToggleButton;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  switch: {
    width: 120,
    height: 40,
    borderRadius: 32,
    padding: 4,
    justifyContent: 'end',
    alignItems: 'center',
    overflow: 'hidden',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: 70,
  },
});