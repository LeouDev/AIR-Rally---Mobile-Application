import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RankBadge } from '@/components/ranked/rank-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PlayerRank } from '@/lib/database.types';
import {
  calibrationState,
  formatRating,
  formatWinRate,
  getPlayerRank,
  listRecentMatches,
  rankLabel,
  type RankedMatchSummary,
} from '@/lib/ranked';
import { useSession } from '@/providers/session';

/** A PlayerRank row exists the instant a player's first ranked match is
 * created, so `rank === null` only ever means "has never opened Ranked
 * at all" — display-wise that's indistinguishable from 0 of 10
 * calibration matches played, not a separate empty state. */
const NEVER_PLAYED: Pick<PlayerRank, 'is_calibrated' | 'calibration_matches'> = {
  is_calibrated: false,
  calibration_matches: 0,
};

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
 * The signed-in player's own AIR/Rally Ranked record: a stats card
 * (wins/losses/win rate/rank/AAR, or calibration progress while
 * unplaced) over their confirmed results, most recent first.
 * listRecentMatches() already filters to status='confirmed' (an
 * unresolved dispute never moved anything, so it has no place in a
 * results history). Singles and doubles share one rating now, so this
 * is one unified list — no mode toggle.
 */
export default function GamesScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [rank, setRank] = useState<PlayerRank | null | undefined>(undefined);
  const [matches, setMatches] = useState<RankedMatchSummary[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [rankRow, matchRows] = await Promise.all([getPlayerRank(userId), listRecentMatches(userId, 20)]);
      setRank(rankRow);
      setMatches(matchRows);
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
      <Stack.Screen options={{ headerShown: true, title: 'Games', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={matches ?? []}
          keyExtractor={(item) => item.match.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              {rank === undefined ? (
                <Skeleton height={168} radius={Radius.xl} />
              ) : (
                <GamesStatsCard rank={rank} />
              )}
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

/** Wins/losses/win rate/rank/AAR for a calibrated player; calibration
 * progress otherwise — the same is_calibrated split RankCard uses on
 * Profile, just with the fuller stat set this screen's the home for. */
function GamesStatsCard({ rank }: { rank: PlayerRank | null }) {
  const theme = useTheme();

  if (!rank?.is_calibrated) {
    const calibration = calibrationState(rank ?? NEVER_PLAYED);
    return (
      <View style={[styles.statsCard, { backgroundColor: theme.navy, borderColor: theme.navy }]}>
        <ThemedText type="caption" style={[styles.eyebrow, { color: theme.primary }]}>
          Calibrating
        </ThemedText>
        <ThemedText type="subtitle" style={{ color: theme.navyForeground }}>
          {calibration.played} of {calibration.total} calibration matches played
        </ThemedText>
        <View style={styles.calibrationTrack}>
          {Array.from({ length: calibration.total }, (_, i) => (
            <View
              key={i}
              style={[
                styles.calibrationSegment,
                { backgroundColor: i < calibration.played ? theme.primary : `${theme.navyForeground}33` },
              ]}
            />
          ))}
        </View>
        <ThemedText type="caption" style={{ color: `${theme.navyForeground}CC` }}>
          Your tier stays hidden until match {calibration.total}. Results still count — they place you.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.statsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.statsTop}>
        <RankBadge tier={rank.tier} size={48} />
        <View style={styles.statsIdentity}>
          <ThemedText type="caption" themeColor="mutedForeground">
            AIR/Rally Rating
          </ThemedText>
          <ThemedText type="heading">{formatRating(rank.rating)}</ThemedText>
          <View style={styles.rankPill}>
            <Ionicons name="star" size={12} color={theme.primary} />
            <ThemedText type="caption" style={{ color: theme.primary }}>
              {rankLabel(rank.tier, rank.pips)}
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Explicitly "Ranked" — Profile shows a total-wins number that
          counts casual results too, so an unlabelled "Wins" here would
          read as the same figure disagreeing with itself. These three
          are the ranked record specifically: they're what the rating
          above them is computed from. */}
      <View style={[styles.statsRow, { borderTopColor: theme.hairline }]}>
        <View style={styles.statCell}>
          <ThemedText type="caption" themeColor="mutedForeground">
            Ranked wins
          </ThemedText>
          <ThemedText type="subtitle">{rank.wins}</ThemedText>
        </View>
        <View style={styles.statCell}>
          <ThemedText type="caption" themeColor="mutedForeground">
            Ranked losses
          </ThemedText>
          <ThemedText type="subtitle">{rank.losses}</ThemedText>
        </View>
        <View style={styles.statCell}>
          <ThemedText type="caption" themeColor="mutedForeground">
            Win Rate
          </ThemedText>
          <ThemedText type="subtitle" themeColor="primary">
            {formatWinRate(rank)}
          </ThemedText>
        </View>
      </View>
    </View>
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
  statsCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  statsTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  statsIdentity: {
    flex: 1,
    gap: 2,
  },
  rankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    marginTop: Spacing.half,
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: Spacing.three,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  eyebrow: {
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  calibrationTrack: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
  },
  calibrationSegment: {
    flex: 1,
    borderRadius: 2,
  },
});
