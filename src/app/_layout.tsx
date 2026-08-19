import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ToastProvider } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useNotificationObserver } from '@/lib/notifications-runtime';
import { SessionProvider, useSession } from '@/providers/session';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <ToastProvider>
        <RootNavigator />
      </ToastProvider>
    </SessionProvider>
  );
}

function RootNavigator() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = Colors[isDark ? 'dark' : 'light'];
  const { session, isLoaded, needsAgreement } = useSession();

  useNotificationObserver();

  // A session exists but its agreement status isn't known yet — same
  // "hold the navigator" reasoning as !isLoaded below, one level deeper:
  // evaluating the guards with a stale/default needsAgreement would
  // flash a signed-in user through (tabs) before possibly yanking them
  // back to complete-signup a moment later.
  const settled = isLoaded && (session === null || needsAgreement !== null);

  useEffect(() => {
    if (settled) SplashScreen.hideAsync();
  }, [settled]);

  // Hold the navigator itself — not just the splash — until the persisted
  // session is restored. If the Stack mounts while `session` is still null
  // only because storage hasn't been read yet, expo-router evaluates the
  // Protected guards as signed-out, redirects a cold deep link into a
  // guarded route (venue/booking/owner) over to sign-in, and loses the
  // original target — so once the session loads it lands on Explore, not
  // where the link pointed. Returning null keeps the initial URL pending
  // (the splash is still up) until the guards can be evaluated correctly
  // once, letting the deep link resolve where it asked.
  if (!settled) return null;

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
        <Stack.Protected guard={session !== null && needsAgreement === false}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="venue/[id]" />
          <Stack.Screen name="booking/[id]/index" />
          <Stack.Screen name="booking/[id]/reschedule" />
          <Stack.Screen name="owner/index" />
          <Stack.Screen name="events/[id]" />
          <Stack.Screen name="events/new" />
          <Stack.Screen name="court-side/index" />
          <Stack.Screen name="court-side/[postId]" />
          <Stack.Screen name="player/[userId]" />
          <Stack.Screen name="credits/index" />
          <Stack.Screen name="clubs/index" />
          <Stack.Screen name="clubs/[id]" />
          <Stack.Screen name="clubs/new" />
          <Stack.Screen name="favorites/index" />
          <Stack.Screen name="account-settings" />
        </Stack.Protected>
        <Stack.Protected guard={session !== null && needsAgreement === true}>
          <Stack.Screen name="complete-signup" />
        </Stack.Protected>
        <Stack.Protected guard={session === null}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* Unconditional — reachable from sign-up (signed out) AND
            complete-signup (signed in, agreement pending), the two places
            that link to it. Neither guard above covers both states. */}
        <Stack.Screen name="legal/[doc]" />
        {/* Unconditional — a password-recovery deep link can land while
            signed out, signed in, or (via the recovery code exchange)
            somewhere in between; no single guard covers all of that. */}
        <Stack.Screen name="reset-password" />
      </Stack>
    </ThemeProvider>
  );
}
