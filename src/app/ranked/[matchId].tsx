import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LiveScoreboard } from '@/components/ranked/match/live-scoreboard';
import { LobbyPhase } from '@/components/ranked/match/lobby-phase';
import { OfficiatingPhase } from '@/components/ranked/match/officiating-phase';
import { ResultPhase } from '@/components/ranked/match/result-phase';
import { ReportAction } from '@/components/report-action';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRankedMatch } from '@/hooks/use-ranked-match';
import { getMatch, type RankedMatchDetail } from '@/lib/ranked';
import { useSession } from '@/providers/session';

/**
 * One route for a ranked match's entire life. `ranked_matches.status`
 * moves underneath the group of players who keep this URL open;
 * useRankedMatch (below, inside LiveMatch) keeps this screen's copy of
 * that row live over Realtime, and the phase rendered just follows it.
 * Ported from the web's ranked/match/[matchId]/page.tsx +
 * RankedMatchRoom.tsx combined into one screen, this app's convention.
 */
export default function RankedMatchScreen() {
  const theme = useTheme();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { session } = useSession();
  const currentUserId = session?.user.id ?? '';

  // undefined = still loading, null = resolved to no match.
  const [initial, setInitial] = useState<RankedMatchDetail | null | undefined>(undefined);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    getMatch(matchId)
      .then((match) => {
        if (!cancelled) setInitial(match);
      })
      .catch(() => {
        if (!cancelled) setInitial(null);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Ranked match',
          headerBackButtonDisplayMode: 'minimal',
          headerRight: initial
            ? () => <ReportAction targetType="ranked_match" targetId={initial.id} targetLabel="match" />
            : undefined,
        }}
      />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {initial === undefined ? (
            <View style={styles.stack}>
              <Skeleton height={280} radius={Radius.xl} />
              <Skeleton height={140} radius={Radius.xl} />
            </View>
          ) : initial === null ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText type="subtitle">Match not found</ThemedText>
              <ThemedText type="small" themeColor="subtle">
                It may have been cancelled, or belongs to a different account.
              </ThemedText>
            </View>
          ) : (
            <LiveMatch matchId={matchId} initial={initial} currentUserId={currentUserId} />
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Split out so useRankedMatch — which needs a non-null `initial` — only
 * ever mounts once the first load has actually resolved a match. */
function LiveMatch({
  matchId,
  initial,
  currentUserId,
}: {
  matchId: string;
  initial: RankedMatchDetail;
  currentUserId: string;
}) {
  const theme = useTheme();
  const match = useRankedMatch(matchId, initial);

  switch (match.status) {
    case 'lobby':
      return <LobbyPhase match={match} currentUserId={currentUserId} />;
    case 'officiating':
      return <OfficiatingPhase match={match} currentUserId={currentUserId} />;
    case 'live':
      return <LiveScoreboard match={match} currentUserId={currentUserId} />;
    case 'awaiting_confirmation':
    case 'confirmed':
    case 'disputed':
      return <ResultPhase match={match} currentUserId={currentUserId} />;
    case 'cancelled':
      return (
        <View style={[styles.card, styles.cancelledCard, { backgroundColor: theme.card, borderColor: theme.navy }]}>
          <ThemedText type="subtitle" style={styles.centerText}>
            This match was cancelled
          </ThemedText>
          <ThemedText type="small" themeColor="subtle" style={styles.centerText}>
            Nothing was recorded against anyone&apos;s rank.
          </ThemedText>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  stack: {
    gap: Spacing.three,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  cancelledCard: {
    borderWidth: 2,
    alignItems: 'center',
    paddingVertical: Spacing.six,
  },
  centerText: {
    textAlign: 'center',
  },
});
