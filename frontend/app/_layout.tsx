import { Poppins_400Regular, Poppins_600SemiBold, Poppins_800ExtraBold } from '@expo-google-fonts/poppins';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { setupAuthListener } from '@/utils/supabase';
import { colors } from '@/constants/theme';
import { AlertProvider } from '@/context/AlertContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext'; // ADD THIS
import { useFonts } from 'expo-font';
import { ActivityIndicator, View } from 'react-native';
import { logger } from '@/utils/logger';
import ErrorBoundary from '@/components/ErrorBoundary';
import OfflineIndicator from '@/components/OfflineIndicator';
import { useTheme } from '@/context/ThemeContext';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Pacifico: require('../assets/fonts/Pacifico-Regular.ttf'),
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_800ExtraBold,
  });
  useEffect(() => {
    // Setup deep link listener for auth
    // COMMENTED OUT FOR TESTING - Disable deep linking
    const cleanup = setupAuthListener();

    // Cleanup cache on app start
    const cleanupCache = async () => {
      try {
        const { supabase } = await import('@/utils/supabase');
        const { data: { session }, error } = await supabase.auth.getSession();

        // Handle invalid refresh token
        if (error && (error.message?.includes('Invalid Refresh Token') ||
          error.message?.includes('refresh_token_not_found'))) {
          logger.log('[RootLayout] Invalid refresh token detected, clearing session');
          await supabase.auth.signOut().catch(() => {
            // Ignore signOut errors
          });
          return;
        }

        if (session?.user?.id) {
          const { checkAndCleanupStorage } = await import('@/utils/dataCache');
          await checkAndCleanupStorage(session.user.id);
        }
      } catch (error) {
        logger.error('[RootLayout] Cache cleanup error:', error);
        // Continue even if cache cleanup fails
      }
    };
    cleanupCache();

    return () => cleanup();
  }, []);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.deepCharcoal }}>
        <ActivityIndicator size="large" color={colors.white} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <ThemeProvider>
          <AuthProvider>
            <AlertProvider>
              <OfflineIndicator />
              <StackNavigatorWithBackground />
            </AlertProvider>
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

function StackNavigatorWithBackground() {
  const { colors: themeColors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: themeColors.background },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
            contentStyle: { backgroundColor: themeColors.background },
          }}
        />
        <Stack.Screen
          name="(auth)"
          options={{
            headerShown: false,
            contentStyle: { backgroundColor: themeColors.background },
          }}
        />
        <Stack.Screen
          name="(main)"
          options={{
            headerShown: false,
            contentStyle: { backgroundColor: themeColors.background },
          }}
        />
      </Stack>
    </View>
  );
}