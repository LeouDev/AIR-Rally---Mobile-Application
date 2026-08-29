import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { calculateSplit, formatShare } from '@/lib/event-split';
import { listMyEventStatuses, listUpcomingEvents, type EventWithDetails } from '@/lib/events';
import type { EventAttendeeStatus, RankedMatchStatus } from '@/lib/database.types';
import { getActiveMatch, opponentNames, type RankedMatchDetail } from '@/lib/ranked';
import { useSession } from '@/providers/session';

/** What a returning player actually needs to know before tapping back
 * in — not the internal status name. 'confirmed'/'disputed'/'cancelled'
 * never reach here; getActiveMatch() only ever returns one of these
 * four (ACTIVE_MATCH_STATUSES in lib/ranked.ts). */
function resumeMatchLabel(status: RankedMatchStatus): string {
  switch (status) {
    case 'lobby':
      return 'Waiting in the lobby';
    case 'officiating':
      return 'Choosing a scorekeeper';
    case 'live':
      return 'Live right now';
    case 'awaiting_confirmation':
      return 'Waiting on the result';
    default:
      return 'In progress';
  }
}

/** Above this, individual slot dots stop reading as a roster and start
 * reading as noise — the "X/Y playing" text alone carries it better. */
const CAPACITY_DOT_LIMIT = 8;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function PlayScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [events, setEvents] = useState<EventWithDetails[] | null>(null);
  const [myStatuses, setMyStatuses] = useState<Map<string, EventAttendeeStatus>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  // undefined while loading/no session, null once resolved to "none" —
  // same two-step shape as everywhere else a fetch decides whether to
  // render a card at all. Refetched on every focus (not just mount),
  // the same as `events` below, so logging out and back in — the
  // founder's own repro — lands on a screen that actually looked again
  // rather than one holding a stale answer from before the app closed.
  const [activeMatch, setActiveMatch] = useState<RankedMatchDetail | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const rows = await listUpcomingEvents(50);
      setEvents(rows);
      setError(false);
      if (userId) {
        setMyStatuses(await listMyEventStatuses(userId, rows.map((e) => e.id)));
      }
    } catch {
      setEvents([]);
      setError(true);
    }

    // Its own try/catch, deliberately outside the one above — a failed
    // active-match lookup has no business turning into "couldn't load
    // games" for the Open Play list underneath it, or vice versa.
    if (!userId) {
      setActiveMatch(null);
      return;
    }
    try {
      setActiveMatch(await getActiveMatch(userId));
    } catch {
      // A failed lookup here reads the same as "no active match" — this
      // card never gets an error state of its own, same posture as
      // RankCard's own Ranked lookup on the Profile tab.
      setActiveMatch(null);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={events ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const split = calculateSplit(item.price_amount, Math.max(item.attendeeCount, 1));
            const status = myStatuses.get(item.id) ?? null;
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/events/[id]', params: { id: item.id } })}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.92 : 1 },
                ]}>
                <View style={styles.cardHeader}>
                  <View style={styles.titleBlock}>
                    <ThemedText type="caption" themeColor="primary" style={styles.eyebrow}>
                      Open Play
                    </ThemedText>
                    <ThemedText type="subtitle" style={styles.title} numberOfLines={1}>
                      {item.title}
                    </ThemedText>
                  </View>
                  {status === 'joined' ? <Badge label="You're in" tone="success" /> : null}
                  {status === 'waitlisted' ? <Badge label="Waitlisted" tone="warning" /> : null}
                  {status === 'pending_approval' ? <Badge label="Requested" tone="neutral" /> : null}
                </View>

                <ThemedText type="small" themeColor="subtle">
                  {formatWhen(item.start_time)}
                </ThemedText>
                {item.venue ? (
                  <ThemedText type="small" themeColor="subtle" numberOfLines={1}>
                    {[item.venue.name, item.venue.city].filter(Boolean).join(', ')}
                  </ThemedText>
                ) : null}

                <View style={[styles.stub, { borderTopColor: theme.hairline }]}>
                  <View style={styles.slotsRow}>
                    {item.max_players && item.max_players <= CAPACITY_DOT_LIMIT ? (
                      <View style={styles.slotDots}>
                        {Array.from({ length: item.max_players }, (_, i) => (
                          <View
                            key={i}
                            style={[
                              styles.slotDot,
                              i < item.attendeeCount
                                ? { backgroundColor: theme.primary }
                                : { borderColor: theme.border, borderWidth: 1.5 },
                            ]}
                          />
                        ))}
                      </View>
                    ) : null}
                    <ThemedText type="small" themeColor="subtle">
                      {item.attendeeCount}
                      {item.max_players ? ` / ${item.max_players}` : ''} playing
                      {item.isFull ? ' · full' : ''}
                    </ThemedText>
                  </View>

                  {item.price_amount > 0 ? (
                    <ThemedText type="small">
                      <ThemedText type="smallBold">{formatShare(split.sharePerPlayer)}</ThemedText>{' '}
                      <ThemedText type="small" themeColor="mutedForeground">
                        each
                      </ThemedText>
                    </ThemedText>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
          ListHeaderComponent={
            <View style={styles.header}>
              {/* Two genuinely different things, not two views of one, so
                  they get two actions rather than a toggle: Open Play is
                  strangers joining a court someone booked; the doorway is
                  people you already know, right now. The doorway leads
                  because it works for every player, while Open Play only
                  works for someone holding a booking. */}
              <View style={styles.headerRow}>
                <ThemedText type="title">Play</ThemedText>
              </View>

              {activeMatch ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/ranked/[matchId]', params: { matchId: activeMatch.id } })}
                  style={({ pressed }) => [
                    styles.resumeCard,
                    { backgroundColor: theme.navy, borderColor: theme.navy, opacity: pressed ? 0.92 : 1 },
                  ]}>
                  <ThemedText type="caption" style={[styles.eyebrow, { color: theme.rally }]}>
                    Match in progress
                  </ThemedText>
                  <ThemedText type="subtitle" style={{ color: theme.navyForeground }}>
                    {(() => {
                      const me = activeMatch.players.find((p) => p.user_id === userId);
                      const opponents = me ? opponentNames(activeMatch.players, me) : null;
                      return opponents ? `vs ${opponents}` : resumeMatchLabel(activeMatch.status);
                    })()}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: `${theme.navyForeground}CC` }}>
                    {resumeMatchLabel(activeMatch.status)} — tap to jump back in
                  </ThemedText>
                </Pressable>
              ) : null}

              <ThemedText type="small" themeColor="subtle">
                Ranked or casual, with people you already know. No booking needed.
              </ThemedText>
              <Button title="Start a game" onPress={() => router.push('/ranked/play')} />

              <View style={[styles.sectionDivider, { borderTopColor: theme.border }]}>
                <ThemedText type="subtitle">Open Play</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Games with open spots for anyone to join. One player books the court — everyone sorts out the split
                  between themselves.
                </ThemedText>
                <Button title="Host on your booking" variant="outline" onPress={() => router.push('/events/new')} />
              </View>

              {error ? (
                <ThemedText type="small" themeColor="destructive">
                  Couldn&apos;t load games. Pull to retry.
                </ThemedText>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            events === null ? (
              <View style={styles.skeletons}>
                <Skeleton height={140} radius={Radius.xl} />
                <Skeleton height={140} radius={Radius.xl} />
              </View>
            ) : (
              <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">No open games right now</ThemedText>
                {/* Deliberately not "book a court" as the only way out —
                    that's addressed to someone who has one to book, which
                    today is nobody, and after launch is every player in a
                    city with no listed venue. Point at what they can do. */}
                <ThemedText type="small" themeColor="subtle">
                  Open Play needs someone to have booked a court. You don&apos;t need one to play — use Start a game
                  above and bring your own players.
                </ThemedText>
              </View>
            )
          }
        />
      </SafeAreaView>
    </ThemedView>
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
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  sectionDivider: {
    borderTopWidth: 1,
    paddingTop: Spacing.four,
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resumeCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: 4,
  },
  eyebrow: {
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    padding: Spacing.four,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  titleBlock: {
    flexShrink: 1,
    gap: 2,
  },
  title: {
    flexShrink: 1,
  },
  stub: {
    marginTop: Spacing.one,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  slotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  slotDots: {
    flexDirection: 'row',
    gap: 3,
  },
  slotDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
});
