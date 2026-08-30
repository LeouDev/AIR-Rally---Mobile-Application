import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { EnvironmentBanner } from '@/components/environment-banner';
import { ErrorScreen } from '@/components/error-screen';
import { SplashOverlay } from '@/components/splash-overlay';
import { ToastProvider } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotificationObserver } from '@/lib/notifications-runtime';
import { initSentry } from '@/lib/sentry';
import { markSplashTiming } from '@/lib/splash-timing';
import { SessionProvider, useSession } from '@/providers/session';

SplashScreen.preventAutoHideAsync();

// Module scope, before any component renders: the global handlers Sentry
// installs have to be in place before the first error can happen, and a
// crash during startup is exactly the one worth catching.
initSentry();

/**
 * expo-router wraps a route in a React error boundary whenever that
 * route exports one. Exporting it from the ROOT layout puts a boundary
 * around the entire app — every screen, and the providers above them —
 * which is the only placement that can catch a render throw wherever it
 * happens. Without it the app renders white, with no way back and no
 * signal that anything went wrong.
 *
 * The splash screen has to be dismissed here too: the crash may have
 * happened before RootNavigator ever reached its own hideAsync, and a
 * fallback screen behind a splash is still a frozen app.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  SplashScreen.hideAsync().catch(() => {});
  return <ErrorScreen error={error} retry={retry} />;
}

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
  const [overlayFinished, setOverlayFinished] = useState(false);

  // Temporary — see splash-timing.ts. T2: session restore (and
  // agreement-status resolution) finished.
  useEffect(() => {
    if (settled) markSplashTiming('t2_settled');
  }, [settled]);

  // The native splash hides the instant the JS animated one is ready to
  // take over — not gated on `settled` the way it used to be. The JS
  // overlay covers the same ground the native splash did, so there's
  // nothing to wait for here; waiting would just add a blank frame
  // between the two.
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Hold the NAVIGATOR itself — not just the splash — until the persisted
  // session is restored. If the Stack mounted while `session` is still
  // null only because storage hasn't been read yet, expo-router would
  // evaluate the Protected guards as signed-out, redirect a cold deep
  // link into a guarded route (venue/booking/owner) over to sign-in, and
  // lose the original target — so once the session loads it lands on
  // Explore, not where the link pointed. `settled` below gates the Stack
  // exactly as before; only what's visible underneath changed.
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
    <>
      {/* The overlay stays in this SAME position (a fixed sibling,
          never swapped for the subtree it sits beside) whether or not
          `settled` is true yet — `ready` is the only thing that changes
          about it. Returning a differently-shaped tree before/after
          `settled` would unmount and remount it right as it needs to
          keep animating, resetting its in-flight state. */}
      {settled ? (
        <ThemeProvider value={navigationTheme}>
          {/* Overlay, not a sibling row — renders nothing at all on a
              correctly-configured production build. */}
          <EnvironmentBanner />
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
              <Stack.Screen name="court-side/club/[clubId]" />
              <Stack.Screen name="player/[userId]" />
              <Stack.Screen name="credits/index" />
              <Stack.Screen name="clubs/index" />
              <Stack.Screen name="clubs/[id]" />
              <Stack.Screen name="clubs/new" />
              <Stack.Screen name="favorites/index" />
              <Stack.Screen name="blocked/index" />
              <Stack.Screen name="account-settings" />
              <Stack.Screen name="support/index" />
              <Stack.Screen name="ranked/[matchId]" />
              <Stack.Screen name="ranked/games" />
              <Stack.Screen name="ranked/new" />
              <Stack.Screen name="ranked/play" />
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
            {/* Unconditional — the Ranked ladder is public (ranked_leaderboard's
            own RLS allows anon), same posture as the web's /ranked/leaderboard
            staying outside the account-gated /profile prefix. */}
            <Stack.Screen name="ranked/leaderboard" />
          </Stack>
        </ThemeProvider>
      ) : null}
      {!overlayFinished ? <SplashOverlay ready={settled} onFinished={() => setOverlayFinished(true)} /> : null}
    </>
  );
}
