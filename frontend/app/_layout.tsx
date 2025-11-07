import { useEffect } from 'react';
import { Stack } from 'expo-router';
//import { setupAuthListener } from '@/utils/supabase';
import { AlertProvider } from '@/context/AlertContext';

export default function RootLayout() {
  useEffect(() => {
    // Setup deep link listener for auth
    // COMMENTED OUT FOR TESTING - Disable deep linking
    // const cleanup = setupAuthListener();
    // return () => cleanup();
  }, []);

  return (
    <AlertProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(main)" options={{ headerShown: false }} />
      </Stack>
    </AlertProvider>

  );
}