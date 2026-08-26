import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { BookingStatus } from '@/lib/database.types';
import {
  formatBookingWindow,
  formatCentavos,
  listMyBookings,
  type BookingWithCourt,
} from '@/lib/bookings';
import { listHostableBookings } from '@/lib/events';
import { useSession } from '@/providers/session';

type BookingSection = { title: string; data: BookingWithCourt[] };

/** Upcoming = not cancelled and hasn't started. Everything else — past,
 * completed, cancelled — falls below, newest first. */
function toSections(bookings: BookingWithCourt[]): BookingSection[] {
  const now = Date.now();
  const upcoming: BookingWithCourt[] = [];
  const past: BookingWithCourt[] = [];

  for (const booking of bookings) {
    const isUpcoming =
      booking.status !== 'cancelled' && new Date(booking.start_time).getTime() > now;
    (isUpcoming ? upcoming : past).push(booking);
  }

  // Upcoming reads soonest-first; history reads most-recent-first.
  upcoming.sort((a, b) => a.start_time.localeCompare(b.start_time));

  return [
    { title: 'Upcoming', data: upcoming },
    { title: 'Past', data: past },
  ].filter((section) => section.data.length > 0);
}

function statusBadge(status: BookingStatus): { tone: 'success' | 'warning' | 'neutral'; label: string } {
  switch (status) {
    case 'confirmed':
      return { tone: 'success', label: 'Confirmed' };
    case 'pending':
      return { tone: 'warning', label: 'Pending payment' };
    case 'completed':
      return { tone: 'neutral', label: 'Completed' };
    case 'cancelled':
      return { tone: 'neutral', label: 'Cancelled' };
  }
}

export default function BookingsScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [bookings, setBookings] = useState<BookingWithCourt[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Which upcoming bookings can still start a game — a booking that
  // already has one (or one outside the pending/confirmed+upcoming
  // window listHostableBookings itself requires) doesn't get the
  // affordance at all, rather than offering an action that would
  // silently land on a different booking than the one tapped.
  const [hostableIds, setHostableIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [myBookings, hostable] = await Promise.all([
        listMyBookings(),
        userId ? listHostableBookings(userId) : Promise.resolve([]),
      ]);
      setBookings(myBookings);
      setHostableIds(new Set(hostable.filter((b) => !b.existingEventId).map((b) => b.bookingId)));
      setError(false);
    } catch {
      setError(true);
      setBookings((prev) => prev ?? []);
    }
  }, [userId]);

  // Refetch every time the tab gains focus — a booking made moments ago
  // on the venue screen should already be here when the user lands.
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
        <SectionList
          sections={toSections(bookings ?? [])}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <ThemedText type="caption" themeColor="mutedForeground" style={styles.sectionLabel}>
              {section.title.toUpperCase()}
            </ThemedText>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <ThemedText type="title">Bookings</ThemedText>
              {error ? (
                <ThemedText type="small" themeColor="destructive">
                  Couldn&apos;t refresh. Pull to retry.
                </ThemedText>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            bookings === null ? (
              <View style={styles.stack}>
                <Skeleton height={110} radius={Radius.xl} />
                <Skeleton height={110} radius={Radius.xl} />
              </View>
            ) : (
              <View
                style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">No bookings yet</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Find a court on Explore — your reservations land here.
                </ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => {
            const badge = statusBadge(item.status);
            const timezone = item.courts?.venues?.timezone ?? 'Asia/Manila';
            const hostable = hostableIds.has(item.id);
            const expanded = expandedId === item.id;
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}>
                <View style={styles.cardTop}>
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.cardTitle}>
                    {item.courts?.venues?.name ?? 'Venue'} · {item.courts?.name ?? 'Court'}
                  </ThemedText>
                  <View style={styles.cardTopRight}>
                    <Badge label={badge.label} tone={badge.tone} />
                    {hostable ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={expanded ? 'Hide actions' : 'Show actions'}
                        onPress={() => setExpandedId(expanded ? null : item.id)}
                        hitSlop={8}>
                        <Ionicons
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={theme.mutedForeground}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <ThemedText type="small" themeColor="subtle">
                  {formatBookingWindow(item.start_time, item.end_time, timezone)}
                </ThemedText>
                <View style={[styles.cardBottom, { borderTopColor: theme.hairline }]}>
                  <ThemedText type="caption">Code {item.confirmation_code}</ThemedText>
                  <ThemedText type="smallBold">{formatCentavos(item.price_amount)}</ThemedText>
                </View>

                {hostable && expanded ? (
                  <View style={styles.expanded}>
                    <Button
                      title="Start Game"
                      onPress={() =>
                        router.push({ pathname: '/events/new', params: { bookingId: item.id } })
                      }
                    />
                  </View>
                ) : null}
              </Pressable>
            );
          }}
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
    marginBottom: Spacing.one,
  },
  sectionLabel: {
    letterSpacing: 1.2,
    marginTop: Spacing.one,
  },
  stack: {
    gap: Spacing.three,
  },
  empty: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardTitle: {
    flexShrink: 1,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  expanded: {
    marginTop: Spacing.two,
  },
});
