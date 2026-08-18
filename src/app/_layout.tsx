import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
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

  // Splash stays up until the persisted session is restored, so a cold
  // start never flashes the sign-in screen at an already-signed-in user.
  if (isLoaded) {
    SplashScreen.hideAsync();
  }

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
        </Stack.Protected>
        <Stack.Protected guard={session === null}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
