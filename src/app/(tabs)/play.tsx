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
import { listAttendingEventIds, listUpcomingEvents, type EventWithDetails } from '@/lib/events';
import { useSession } from '@/providers/session';

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
  const [attendingIds, setAttendingIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await listUpcomingEvents(50);
      setEvents(rows);
      setError(false);
      if (userId) {
        const ids = await listAttendingEventIds(
          userId,
          rows.map((e) => e.id)
        );
        setAttendingIds(new Set(ids));
      }
    } catch {
      setEvents([]);
      setError(true);
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
            const joined = attendingIds.has(item.id);
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/events/[id]', params: { id: item.id } })}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.92 : 1 },
                ]}>
                <View style={styles.cardHeader}>
                  <ThemedText type="subtitle" style={styles.title} numberOfLines={1}>
                    {item.title}
                  </ThemedText>
                  {joined ? <Badge label="You're in" tone="success" /> : null}
                </View>

                <ThemedText type="small" themeColor="subtle">
                  {formatWhen(item.start_time)}
                </ThemedText>
                {item.venue ? (
                  <ThemedText type="small" themeColor="subtle" numberOfLines={1}>
                    {[item.venue.name, item.venue.city].filter(Boolean).join(', ')}
                  </ThemedText>
                ) : null}
                <ThemedText type="small" themeColor="subtle">
                  {item.attendeeCount}
                  {item.max_players ? ` / ${item.max_players}` : ''} playing
                  {item.isFull ? ' · full' : ''}
                </ThemedText>

                {item.price_amount > 0 ? (
                  <ThemedText type="small">
                    <ThemedText type="smallBold">{formatShare(split.sharePerPlayer)}</ThemedText>{' '}
                    <ThemedText type="small" themeColor="mutedForeground">
                      each if split {split.playerCount} ways
                    </ThemedText>
                  </ThemedText>
                ) : null}
              </Pressable>
            );
          }}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <ThemedText type="title">Open Play</ThemedText>
              </View>
              <ThemedText type="small" themeColor="subtle">
                Games with open spots. One player books the court — everyone sorts out the split between themselves.
              </ThemedText>
              <Button title="Start a game" onPress={() => router.push('/events/new')} />
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
                <ThemedText type="subtitle">No games coming up</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Book a court and add your playmates — your game shows up here for others to join.
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  title: {
    flexShrink: 1,
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
