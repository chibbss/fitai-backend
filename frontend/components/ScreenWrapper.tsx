import { Dimensions, Platform, StatusBar, StyleSheet, View, Image } from 'react-native';
import React, { useEffect } from 'react';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ScreenWrapperProps } from '@/types';
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';

const { height, width } = Dimensions.get('window');
const screenHeight = Dimensions.get('screen').height;

const ScreenWrapper = ({
  style,
  children,
  showPattern = false,
  isModal = false,
  bgOpacity = 1,
  backgroundImage,
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

  const containerBackground =
    showPattern || bgOpacity > 0 ? themeColors.background : 'transparent';

  return (
    <View style={{ flex: 1, backgroundColor: containerBackground }}>
      {/* ✅ Background looping video (fades in) 
      {showPattern && (
        <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            allowsPictureInPicture={false}
          />
        </Animated.View>
      )}*/}

      {backgroundImage && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: width,
              height: screenHeight,
              zIndex:0
            },
            animatedStyle
          ]}
        >
          <Image
            source={backgroundImage}
            style={{
              width: width,
              height: screenHeight,
            }}
            resizeMode="cover"
          />
        </Animated.View>
      )}


      {/* ✅ Overlay for opacity control */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: themeColors.background,
            opacity: backgroundImage
              ? bgOpacity
              : (showPattern ? 1 - bgOpacity : bgOpacity === 0 ? 0 : 1),
            zIndex: 1,
          },
        ]}
      />

      {/* ✅ Foreground content */}
      <View style={[{ paddingTop, paddingBottom, flex: 1, zIndex:2 }, style]}>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor="transparent"
          translucent
        />
        {children}
      </View>
    </View>
  );
};

export default ScreenWrapper;
