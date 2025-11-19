import React from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
  G,
  Circle,
  Filter,
  FeGaussianBlur,
  FeColorMatrix,
  FeBlend,
} from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { Easing } from "react-native-reanimated";

type BlobConfig = {
  size: number;
  cxPercent: number;
  bottomPercent: number;
  travelHeights: number;
  duration: number;
  wobbleDuration: number;
  wobbleAmplitude: number;
  phaseOffset: number;
};

const blobs: BlobConfig[] = [
  {
    size: 200,
    cxPercent: 0.35,
    bottomPercent: 0.15,
    travelHeights: 6,
    duration: 18000,
    wobbleDuration: 4000,
    wobbleAmplitude: 0.08,
    phaseOffset: 0.1,
  },
  {
    size: 330,
    cxPercent: 0.76,
    bottomPercent: 0.65,
    travelHeights: 4.2,
    duration: 22000,
    wobbleDuration: 5000,
    wobbleAmplitude: 0.06,
    phaseOffset: 0.35,
  },
  {
    size: 150,
    cxPercent: 0.34,
    bottomPercent: 0.15,
    travelHeights: 3.05,
    duration: 16000,
    wobbleDuration: 6000,
    wobbleAmplitude: 0.1,
    phaseOffset: 0.55,
  },
  {
    size: 235,
    cxPercent: 0.3,
    bottomPercent: 0.19,
    travelHeights: 4.65,
    duration: 16000,
    wobbleDuration: 8000,
    wobbleAmplitude: 0.07,
    phaseOffset: 0.8,
  },
  {
    size: 55,
    cxPercent: 0.34,
    bottomPercent: 0.25,
    travelHeights: 7,
    duration: 32000,
    wobbleDuration: 9000,
    wobbleAmplitude: 0.12,
    phaseOffset: 0.22,
  },
  {
    size: 35,
    cxPercent: 0.66,
    bottomPercent: 0.25,
    travelHeights: 7,
    duration: 12000,
    wobbleDuration: 10000,
    wobbleAmplitude: 0.14,
    phaseOffset: 0.68,
  },
  {
    size: 435,
    cxPercent: 0.6,
    bottomPercent: 0.85,
    travelHeights: 3,
    duration: 32000,
    wobbleDuration: 11000,
    wobbleAmplitude: 0.05,
    phaseOffset: 0.45,
  },
];

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function LavaLamp() {
  const { width, height } = useWindowDimensions();

  return (
    <View style={styles.container} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="blobGradient" x1="0.8" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#ff9298" />
            <Stop offset="100%" stopColor="#ff008d" />
          </SvgLinearGradient>
          <Filter id="goo">
            <FeGaussianBlur
              in="SourceGraphic"
              stdDeviation="10"
              result="blur"
            />
            <FeColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="goo"
            />
            <FeBlend in="SourceGraphic" in2="goo" />
          </Filter>
        </Defs>

        <Rect width="100%" height="100%" fill="#ffffff" />

        <G filter="url(#goo)">
          {blobs.map((blob, index) => (
            <Blob
              key={`blob-${index}`}
              config={blob}
              width={width}
              height={height}
            />
          ))}
          <Rect
            x={0}
            y={-height * 0.03}
            width={width}
            height={height * 0.04}
            fill="url(#blobGradient)"
            rx={width}
          />
          <Rect
            x={0}
            y={height * 0.99}
            width={width}
            height={height * 0.045}
            fill="url(#blobGradient)"
            rx={width}
          />
        </G>
      </Svg>
    </View>
  );
}

type BlobProps = {
  config: BlobConfig;
  width: number;
  height: number;
};

const Blob = ({ config, width, height }: BlobProps) => {
  const progress = useSharedValue(config.phaseOffset);
  const wobble = useSharedValue(config.phaseOffset);
  const radius = config.size / 2;

  React.useEffect(() => {
    progress.value = withRepeat(
      withTiming(progress.value + 1, {
        duration: config.duration,
        easing: Easing.inOut(Easing.sin),
      }),
      -1
    );

    wobble.value = withRepeat(
      withTiming(wobble.value + 1, {
        duration: config.wobbleDuration,
        easing: Easing.linear,
      }),
      -1
    );

    return () => {
      cancelAnimation(progress);
      cancelAnimation(wobble);
    };
  }, [config, progress, wobble]);

  const animatedProps = useAnimatedProps(() => {
    const normalizedProgress = progress.value % 1;
    const normalizedWobble = wobble.value % 1;

    const baseY = height + config.bottomPercent * height - radius;
    const travelDistance = config.travelHeights * config.size;
    const currentY = baseY - travelDistance * normalizedProgress;

    const wobbleAngle = normalizedWobble * Math.PI * 2;
    const scale = 1 + config.wobbleAmplitude * Math.sin(wobbleAngle);
    const lateralShift = radius * 0.18 * Math.sin(wobbleAngle * 0.8);
    const currentRadius = radius * scale;

    const cx = width * config.cxPercent + lateralShift;
    const cy = currentY;

    return {
      cx,
      cy,
      r: currentRadius,
    };
  });

  return (
    <AnimatedCircle
      animatedProps={animatedProps}
      fill="url(#blobGradient)"
      opacity={0.87}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
  },
});




