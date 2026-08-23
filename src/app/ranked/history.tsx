import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listRecentMatches, type RankedMatchSummary } from '@/lib/ranked';
import { useSession } from '@/providers/session';

function opponentNames(summary: RankedMatchSummary): string {
  const names = summary.opponents.map((p) => p.display_name ?? 'Player');
  return names.length > 0 ? names.join(' & ') : 'Opponent';
}

/** The viewer's score first, then the opponents' — a real minus-style en
 * dash, matching the rest of Ranked's number formatting (formatRatingDelta
 * in lib/ranked.ts). */
function matchScore(summary: RankedMatchSummary): string {
  const mine = summary.me.team === 'a' ? summary.match.score_a : summary.match.score_b;
  const theirs = summary.me.team === 'a' ? summary.match.score_b : summary.match.score_a;
  return `${mine}–${theirs}`;
}

function formatMatchDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The signed-in player's own confirmed ranked results — account-scoped,
 * unlike the public leaderboard. listRecentMatches() already filters to
 * status='confirmed' (an unresolved dispute never moved anything, so it
 * has no place in a results history). Singles and doubles share one
 * rating now, so this is one unified list — no mode toggle.
 */
export default function RankedHistoryScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [matches, setMatches] = useState<RankedMatchSummary[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setMatches(await listRecentMatches(userId, 20));
      setError(false);
    } catch {
      setError(true);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Ranked history', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={matches ?? []}
          keyExtractor={(item) => item.match.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <ThemedText type="small" themeColor="subtle">
                Confirmed ranked results, most recent first.
              </ThemedText>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
          ListEmptyComponent={
            error ? (
              <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">Couldn&apos;t load your match history</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Check your connection and try again.
                </ThemedText>
                <Button title="Try again" variant="outline" onPress={load} />
              </View>
            ) : matches === null ? (
              <View style={styles.skeletons}>
                <Skeleton height={90} radius={Radius.xl} />
                <Skeleton height={90} radius={Radius.xl} />
                <Skeleton height={90} radius={Radius.xl} />
              </View>
            ) : (
              <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">No confirmed ranked matches yet</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Play and confirm a ranked match to see it here.
                </ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => <HistoryRow summary={item} />}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function HistoryRow({ summary }: { summary: RankedMatchSummary }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/ranked/[matchId]', params: { matchId: summary.match.id } })}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.92 : 1 },
      ]}>
      <View style={styles.cardTop}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.cardTitle}>
          vs {opponentNames(summary)}
        </ThemedText>
        <Badge label={summary.won ? 'Won' : 'Lost'} tone={summary.won ? 'success' : 'destructive'} />
      </View>
      {summary.partner ? (
        <ThemedText type="small" themeColor="subtle">
          With {summary.partner.display_name ?? 'Player'}
        </ThemedText>
      ) : null}
      <View style={styles.cardBottom}>
        <ThemedText type="smallBold">{matchScore(summary)}</ThemedText>
        <ThemedText type="caption" themeColor="mutedForeground">
          {formatMatchDate(summary.match.confirmed_at)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  list: {
    padding: Spacing.four,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  skeletons: {
    gap: Spacing.three,
  },
  empty: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardTitle: {
    flexShrink: 1,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.half,
  },
});
