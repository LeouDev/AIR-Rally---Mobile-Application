import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RankBadge } from '@/components/ranked/rank-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { RankedLeaderboardRow, RankedMode } from '@/lib/database.types';
import { formatRating, getLeaderboardEntry, listLeaderboard, pipNumeral } from '@/lib/ranked';
import { useSession } from '@/providers/session';

const MODE_OPTIONS: { value: RankedMode; label: string }[] = [
  { value: 'singles', label: 'Singles' },
  { value: 'doubles', label: 'Doubles' },
];

/**
 * Standings for the open season — public, same posture as the web's
 * /ranked/leaderboard (ranked_leaderboard's RLS is "ranks are public").
 * No sign-in gate: a signed-out visitor sees the same table, just
 * without a "you" footer at the bottom.
 */
export default function LeaderboardScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [mode, setMode] = useState<RankedMode>('singles');
  const [leaders, setLeaders] = useState<RankedLeaderboardRow[] | null>(null);
  const [myEntry, setMyEntry] = useState<RankedLeaderboardRow | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [leaderRows, entry] = await Promise.all([
        listLeaderboard(mode, 25),
        userId ? getLeaderboardEntry(userId, mode) : Promise.resolve(null),
      ]);
      setLeaders(leaderRows);
      setMyEntry(entry);
      setError(false);
    } catch {
      setError(true);
      setLeaders((prev) => prev ?? []);
    }
  }, [mode, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // A mode switch is a deliberate tap, not a background refresh — clear
  // the stale list so the skeleton shows rather than flashing the other
  // mode's rows under the newly-selected tab for a beat.
  const selectMode = (next: RankedMode) => {
    if (next === mode) return;
    setMode(next);
    setLeaders(null);
    setMyEntry(null);
    setError(false);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const myRowVisible = myEntry !== null && (leaders ?? []).some((row) => row.user_id === myEntry.user_id);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Leaderboard', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={leaders ?? []}
          keyExtractor={(item) => item.user_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <ThemedText type="small" themeColor="subtle">
                Standings for the current season.
              </ThemedText>
              <ModeToggle mode={mode} onChange={selectMode} />
              {error ? (
                <ThemedText type="small" themeColor="destructive">
                  Couldn&apos;t refresh. Pull to retry.
                </ThemedText>
              ) : null}
              {leaders !== null && leaders.length > 0 ? (
                <View style={[styles.columnHeader, { borderColor: theme.border }]}>
                  <ThemedText type="caption" themeColor="mutedForeground" style={styles.position}>
                    #
                  </ThemedText>
                  <ThemedText type="caption" themeColor="mutedForeground" style={styles.rowInfo}>
                    Player
                  </ThemedText>
                  <ThemedText type="caption" themeColor="mutedForeground" style={styles.star}>
                    Star
                  </ThemedText>
                  <ThemedText type="caption" themeColor="mutedForeground" style={styles.rating}>
                    AAR
                  </ThemedText>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            leaders === null ? (
              <View style={styles.skeletons}>
                <Skeleton height={60} radius={Radius.lg} />
                <Skeleton height={60} radius={Radius.lg} />
                <Skeleton height={60} radius={Radius.lg} />
              </View>
            ) : (
              <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">Nobody has placed yet this season</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Play a ranked match to be the first name on the board.
                </ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => <LeaderboardRow entry={item} isMe={item.user_id === userId} />}
          ListFooterComponent={
            myEntry && !myRowVisible ? <YouFooter entry={myEntry} /> : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

/** Singles/Doubles segmented toggle — same visual language as the
 * booking panel's DurationSegmented (muted track, navy fill on the
 * active segment). A player's AAR is tracked once per mode, so every
 * read on this screen is scoped to whichever one is selected. */
function ModeToggle({ mode, onChange }: { mode: RankedMode; onChange: (mode: RankedMode) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.muted, borderColor: theme.input }]}>
      {MODE_OPTIONS.map((option) => {
        const active = option.value === mode;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              active && { backgroundColor: theme.navy },
              pressed && { opacity: 0.85 },
            ]}>
            <ThemedText type="smallBold" style={{ color: active ? theme.navyForeground : theme.mutedForeground }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function LeaderboardRow({ entry, isMe }: { entry: RankedLeaderboardRow; isMe: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderColor: theme.hairline }, isMe && { backgroundColor: theme.accent }]}>
      <ThemedText
        type="smallBold"
        style={[styles.position, { color: entry.position <= 3 ? theme.primary : theme.mutedForeground }]}>
        {entry.position}
      </ThemedText>
      <RankBadge tier={entry.tier} size={32} />
      <View style={styles.rowInfo}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {entry.display_name ?? 'Player'}
          {isMe ? ' (you)' : ''}
        </ThemedText>
        <ThemedText type="caption" themeColor="mutedForeground">
          Tier {entry.tier}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" themeColor="primary" style={styles.star}>
        {pipNumeral(entry.pips)}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.rating}>
        {formatRating(entry.rating)}
      </ThemedText>
    </View>
  );
}

/** Only rendered when the signed-in player's own row falls outside the
 * visible top 25 — a "you're #48" pin at the bottom instead of forcing
 * them to scroll a page they're not on. */
function YouFooter({ entry }: { entry: RankedLeaderboardRow }) {
  const theme = useTheme();
  return (
    <View style={[styles.footer, { backgroundColor: theme.navy, borderColor: theme.navy }]}>
      <ThemedText type="smallBold" style={[styles.position, { color: theme.rally }]}>
        {entry.position}
      </ThemedText>
      <RankBadge tier={entry.tier} on="navy" size={32} />
      <View style={styles.rowInfo}>
        <ThemedText type="smallBold" style={{ color: theme.navyForeground }} numberOfLines={1}>
          {entry.display_name ?? 'You'} (you)
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.65 }}>
          Tier {entry.tier}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" style={[styles.star, { color: theme.rally }]}>
        {pipNumeral(entry.pips)}
      </ThemedText>
      <ThemedText type="smallBold" style={[styles.rating, { color: theme.navyForeground }]}>
        {formatRating(entry.rating)}
      </ThemedText>
    </View>
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
    marginBottom: Spacing.one,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    borderWidth: 1,
    padding: 3,
    alignSelf: 'flex-start',
  },
  segment: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderBottomWidth: 2,
    paddingBottom: Spacing.two,
  },
  skeletons: {
    gap: Spacing.two,
  },
  empty: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  position: {
    width: 28,
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  star: {
    width: 36,
    textAlign: 'center',
  },
  rating: {
    width: 64,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
  },
});
