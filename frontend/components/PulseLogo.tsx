import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
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
  const radius = useSharedValue(45);
  const opacity = useSharedValue(0.3);
  const coreColorToggle = useSharedValue(0);

  useEffect(() => {
    radius.value = withRepeat(
      withTiming(67.5, { duration: 1500, easing: Easing.inOut(Easing.ease) }), // 45 * 1.5
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
  }, []);

  const pulseProps = useAnimatedProps(() => ({
    r: radius.value,
    opacity: opacity.value,
  }));

  const coreProps = useAnimatedProps(() => {
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
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="animatedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={colors.electricTeal} />
            <Stop offset="100%" stopColor={colors.aquaGlow} />
          </LinearGradient>
          <RadialGradient id="pulseEffect" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colors.electricTeal} stopOpacity="0.8" />
            <Stop offset="100%" stopColor={colors.electricTeal} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        
        {/* Pulse glow - animates radius instead of scale, stays centered */}
        <AnimatedCircle
          cx="50"
          cy="50"
          fill="url(#pulseEffect)"
          animatedProps={pulseProps}
        />
        
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
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default PulseLogo;