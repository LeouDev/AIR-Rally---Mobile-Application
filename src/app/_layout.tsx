import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useNotificationObserver } from '@/lib/notifications-runtime';
import { SessionProvider, useSession } from '@/providers/session';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

function RootNavigator() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = Colors[isDark ? 'dark' : 'light'];
  const { session, isLoaded } = useSession();

  useNotificationObserver();

  useEffect(() => {
    if (isLoaded) SplashScreen.hideAsync();
  }, [isLoaded]);

  // Hold the navigator itself — not just the splash — until the persisted
  // session is restored. If the Stack mounts while `session` is still null
  // only because storage hasn't been read yet, expo-router evaluates the
  // Protected guards as signed-out, redirects a cold deep link into a
  // guarded route (venue/booking/owner) over to sign-in, and loses the
  // original target — so once the session loads it lands on Explore, not
  // where the link pointed. Returning null keeps the initial URL pending
  // (the splash is still up) until the guards can be evaluated correctly
  // once, letting the deep link resolve where it asked.
  if (!isLoaded) return null;

  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    dark: isDark,
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.background,
      text: palette.foreground,
      border: palette.border,
      notification: palette.primary,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={session !== null}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="venue/[id]" />
          <Stack.Screen name="booking/[id]" />
          <Stack.Screen name="owner/index" />
        </Stack.Protected>
        <Stack.Protected guard={session === null}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
