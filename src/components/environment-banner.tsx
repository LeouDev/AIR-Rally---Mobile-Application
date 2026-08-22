import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeEnvironment, environmentLabel } from '@/lib/environment';

/**
 * A persistent "this is not production" marker.
 *
 * Every EXPO_PUBLIC_* value is baked in at build time, so a build's
 * backend is invisible once it's installed — two builds on the same
 * home screen look identical while writing to different databases. This
 * is the one thing on screen that tells them apart, which is what makes
 * "is this real data?" answerable without going back to the config.
 *
 * Renders NOTHING on a correctly-configured production build, so it can
 * never cost a real user anything. It is an overlay rather than a row in
 * the layout — pinned above the content and non-interactive — so adding
 * it cannot shift a single pixel of the screens beneath it.
 */
export function EnvironmentBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const status = describeEnvironment();

  if (status.isProduction && !status.hasApiMismatch) return null;

  // A mismatch is a broken build, not just a non-production one: reads
  // succeed while every payment call 401s, so it gets the louder colour
  // and says what's actually wrong.
  const tone = status.hasApiMismatch
    ? { bg: theme.destructive, fg: theme.destructiveForeground }
    : { bg: theme.warning, fg: theme.warningForeground };

  const label = status.hasApiMismatch
    ? `${environmentLabel(status)} DB · API ${status.apiUrl ?? 'unset'} — payments will fail`
    : environmentLabel(status);

  return (
    <View
      testID="environment-banner"
      pointerEvents="none"
      // Anchored to the BOTTOM, not the top. Pinned below insets.top it
      // landed inside the navigation header and sat on the centered
      // title — seen on the Ranked leaderboard, where "STAGING" and
      // "Leaderboard" stacked into what looked like a broken two-line
      // header. Nothing in this app draws its own chrome at the bottom
      // of a stack screen, and BottomTabInset lifts it clear of the
      // native tab bar on the tab screens that do.
      style={[styles.wrap, { paddingBottom: insets.bottom + BottomTabInset }]}>
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <ThemedText type="caption" numberOfLines={1} style={{ color: tone.fg, lineHeight: 14 }}>
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  pill: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    maxWidth: '92%',
  },
});
