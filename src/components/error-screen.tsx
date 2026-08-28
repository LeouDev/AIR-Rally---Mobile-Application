import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { captureFatalError, formatReportForSupport, type ErrorReport } from '@/lib/error-reporting';

/**
 * What a player sees instead of a white screen when something throws
 * that the app can't recover from on its own.
 *
 * Two rules shape it. First, it says nothing technical: `error.message`
 * on this screen is how a raw Postgres or Supabase string ends up in
 * front of a customer, so the message is never rendered — it travels
 * only through "Send report", and only when the player taps it. Second,
 * it has to render under the worst conditions in the app, because by
 * definition something above it just failed: it reads the palette
 * directly rather than through `useTheme`, uses no context beyond the
 * safe-area insets expo-router already provides above the root layout,
 * and holds no state that could fail to initialise.
 */
export function ErrorScreen({ error, retry }: { error: Error; retry: () => void | Promise<void> }) {
  const scheme = useColorScheme();
  const theme = Colors[scheme === 'dark' ? 'dark' : 'light'];
  // Captured once, at mount, rather than on every render — a boundary
  // can re-render while the same error is on screen.
  const [report] = useState<ErrorReport>(() => captureFatalError(error));
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retry();
    } finally {
      // If retry() succeeds this component unmounts and the state update
      // never lands; if it throws again the boundary re-catches. Either
      // way the button must not stay stuck in a loading state.
      setRetrying(false);
    }
  };

  const handleSend = async () => {
    try {
      await Share.share({ message: formatReportForSupport(report) });
    } catch {
      // The player dismissed the sheet, or sharing is unavailable.
      // Nothing to recover from — and nothing worth another dialog.
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Wordmark size={26} />

          <View style={styles.copy}>
            <ThemedText type="heading" style={{ color: theme.foreground }}>
              Something went wrong
            </ThemedText>
            <ThemedText style={{ color: theme.subtle }}>
              That&apos;s on us, not you. Nothing you booked or paid for is affected — try again, and
              if it keeps happening, send us the details so we can fix it.
            </ThemedText>
          </View>

          <View style={styles.actions}>
            <Button title="Try again" onPress={handleRetry} loading={retrying} />
            <Button title="Send report" variant="outline" onPress={handleSend} />
          </View>

          {/* The reference is the one technical thing shown, and it is
              here so support can match a conversation to a report
              without the player reading a stack trace. */}
          <View style={[styles.reference, { backgroundColor: theme.muted, borderColor: theme.border }]}>
            <ThemedText type="caption" style={{ color: theme.mutedForeground }}>
              Reference {report.at} · v{report.appVersion}
            </ThemedText>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  copy: {
    gap: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
  },
  reference: {
    alignSelf: 'flex-start',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
