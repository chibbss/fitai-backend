import { Poppins_400Regular, Poppins_600SemiBold, Poppins_800ExtraBold } from '@expo-google-fonts/poppins';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

//import { setupAuthListener } from '@/utils/supabase';
import { colors } from '@/constants/theme';
import { AlertProvider } from '@/context/AlertContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useFonts } from 'expo-font';
import { ActivityIndicator, View } from 'react-native';

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
    // const cleanup = setupAuthListener();
    // return () => cleanup();
  }, []);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.deepCharcoal }}>
        <ActivityIndicator size="large" color={colors.white} />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <AlertProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(main)" options={{ headerShown: false }} />
        </Stack>
      </AlertProvider>
    </ThemeProvider>
  );
}