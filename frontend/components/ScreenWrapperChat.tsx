import { Dimensions, Platform, StatusBar, StyleSheet, View } from 'react-native';
import React, { useEffect } from 'react';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ScreenWrapperProps } from '@/types';
import { colors } from '@/constants/theme';
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';

const { height } = Dimensions.get('window');

const ScreenWrapperChat = ({
  style,
  children,
  showPattern = false,
  isModal = false,
  bgOpacity = 1,
}: ScreenWrapperProps) => {
  const { colors: themeColors, isDarkMode } = useTheme();
  
  // ✅ Load video player
  const player = useVideoPlayer(require('../assets/images/videos/day_animated.mp4'), (player) => {
    player.loop = true;
    player.play();
    player.muted = true;
  });

  // ✅ Add a fade-in animation for a smooth start
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 1000 }); // fade in smoothly
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  let paddingTop = Platform.OS === 'ios' ? height * 0.06 : 40;
  let paddingBottom = 0;

  if (isModal) {
    paddingTop = Platform.OS === 'ios' ? height * 0.02 : 45;
    paddingBottom = height * 0.02;
  }

  // Only apply padding when showPattern is true
  if (!showPattern) {
    paddingTop = 0;
    paddingBottom = 0;
  }

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <StatusBar 
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={themeColors.background} 
        translucent={false}
      />
      {/* ✅ Background looping video (fades in) */}
      {showPattern && (
        <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            allowsPictureInPicture={false}
          />
        </Animated.View>
      )}

      {/* ✅ Overlay for opacity control */}
      {showPattern && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.neutral900, opacity: 1 - bgOpacity },
          ]}
        />
      )}

      {/* ✅ Foreground content */}
      <View style={[{ paddingTop, paddingBottom, flex: 1 }, style]}>
        {children}
      </View>
    </View>
  );
};

export default ScreenWrapperChat;
