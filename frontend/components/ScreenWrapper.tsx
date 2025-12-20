import { Dimensions, Platform, StatusBar, StyleSheet, View, Image } from 'react-native';
import React, { useEffect } from 'react';
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

  // ✅ Start at full opacity to prevent white flash
  const opacity = useSharedValue(1);

  useEffect(() => {
    // Only fade in background images, not the entire screen
    if (backgroundImage) {
      opacity.value = withTiming(1, { duration: 300 });
    }
  }, [backgroundImage]);

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
