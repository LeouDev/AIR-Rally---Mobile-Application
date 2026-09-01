import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View, type AppStateStatus } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getActiveMatch } from '@/lib/ranked';
import { useSession } from '@/providers/session';

/**
 * expo-updates' own defaults (app.json's `updates` block sets only
 * `url` — confirmed, no `checkAutomatically`/`fallbackToCacheTimeout`
 * override) mean an OTA update downloads in the background after a
 * cold launch and applies on the NEXT one. A player who never fully
 * relaunches — backgrounding and foregrounding the same session for
 * days — can sit on a stale bundle indefinitely even after a fix has
 * shipped. This surfaces that a fresh build is ready and offers to
 * apply it now (Updates.reloadAsync()) instead of waiting for whatever
 * eventually forces a real relaunch.
 *
 * Renders nothing on a build with no update available, in dev (Updates
 * APIs behave differently — and can throw — outside a published
 * bundle), or while the viewer has a ranked match in progress: reloading
 * mid-lobby/officiating/live/awaiting-confirmation would yank them out
 * of whatever phase they're in, a worse disruption than staying one
 * version behind a while longer. Same overlay posture as
 * EnvironmentBanner — pinned above the content, never shifting a pixel
 * of the screens beneath it — but interactive, so `pointerEvents`
 * differs (box-none, not none).
 *
 * Checked on a real app-foreground transition, not a timer — same
 * background→active detection as (tabs)/play.tsx's resume-card fix:
 * iOS's actual return sequence is background → inactive → active, so
 * the state immediately before 'active' is always 'inactive', and a
 * naive "was the prior state background" check never fires. A flag
 * tracking whether 'background' was seen at all since the last active
 * state survives that inactive step correctly.
 *
 * Note this only reaches users who already have THIS code — it ships
 * via the same OTA mechanism it's fixing the UX of, and cannot
 * accelerate the very publish that carries it. What it changes is every
 * publish after that one.
 */
export function UpdatePrompt() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [visible, setVisible] = useState(false);
  const [reloading, setReloading] = useState(false);
  const wasBackgrounded = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (__DEV__) return;
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return;

      if (userId) {
        const active = await getActiveMatch(userId).catch(() => null);
        if (active) return;
      }

      await Updates.fetchUpdateAsync();
      setVisible(true);
    } catch {
      // A failed check or fetch just means no prompt this cycle — the
      // app is never worse off than it already was, and update-check
      // plumbing has no business surfacing as a user-facing error.
    }
  }, [userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        wasBackgrounded.current = true;
      } else if (nextState === 'active' && wasBackgrounded.current) {
        wasBackgrounded.current = false;
        void checkForUpdate();
      }
    });
    return () => subscription.remove();
  }, [checkForUpdate]);

  if (!visible) return null;

  const apply = async () => {
    setReloading(true);
    try {
      await Updates.reloadAsync();
    } catch {
      // Stuck reload — better to let them keep using the current
      // session than leave the button spinning forever.
      setReloading(false);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: insets.bottom + BottomTabInset + Spacing.two }]}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.textBlock}>
          <ThemedText type="smallBold">Update ready</ThemedText>
          <ThemedText type="caption" themeColor="mutedForeground">
            Restart to get the latest fixes.
          </ThemedText>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => setVisible(false)} disabled={reloading} hitSlop={8}>
            <ThemedText type="smallBold" themeColor="mutedForeground">
              Not now
            </ThemedText>
          </Pressable>
          <Button title="Restart" onPress={apply} loading={reloading} disabled={reloading} />
        </View>
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
    paddingHorizontal: Spacing.four,
    zIndex: 1000,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  textBlock: {
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.four,
  },
});
