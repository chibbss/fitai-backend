import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Path,
  Defs,
  LinearGradient,
  Stop,
  RadialGradient,
} from 'react-native-svg';
import { colors } from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const PulseLogo = ({ size = 180 }: { size?: number }) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.3);
  const coreColorToggle = useSharedValue(0);

  useEffect(() => {
    // Start animations immediately - use direct assignment for iOS compatibility
    scale.value = withRepeat(
      withTiming(1.5, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    opacity.value = withRepeat(
      withTiming(0.1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    coreColorToggle.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [scale, opacity, coreColorToggle]);

  // Use useAnimatedStyle for the pulse glow wrapper (more reliable on iOS)
  const pulseGlowStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  // Keep useAnimatedProps for color interpolation (works well on iOS)
  const coreProps = useAnimatedProps(() => {
    'worklet';
    const fillColor = interpolateColor(
      coreColorToggle.value,
      [0, 1],
      [colors.electricTeal, colors.vibrantCoral]
    );
    return {
      fill: fillColor,
    };
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View style={styles.svgWrapper}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="animatedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={colors.electricTeal} />
              <Stop offset="100%" stopColor={colors.aquaGlow} />
            </LinearGradient>
          </Defs>
          
          {/* Static neural path and nodes */}
          <Path
            d="M25,65 Q40,35 50,50 T85,40"
            fill="none"
            stroke="url(#animatedGradient)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <Circle cx="25" cy="65" r="4" fill={colors.electricTeal} />
          <AnimatedCircle
            cx="50"
            cy="50"
            r="4.5"
            animatedProps={coreProps}
          />
          <Circle cx="85" cy="40" r="4" fill="#4FFFD3" />
        </Svg>
      </View>
      
      {/* Pulse glow - wrapped in Animated.View with scale and opacity animation */}
      <Animated.View 
        style={[
          styles.pulseGlowWrapper,
          { width: size, height: size },
          pulseGlowStyle
        ]}
        pointerEvents="none"
      >
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="pulseEffect" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={colors.electricTeal} stopOpacity="0.8" />
              <Stop offset="100%" stopColor={colors.electricTeal} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="45" fill="url(#pulseEffect)" />
        </Svg>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  svgWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 2,
  },
  pulseGlowWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
});

export default PulseLogo;