import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Skeleton } from '@/components/ui/skeleton';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme, type Theme } from '@/hooks/use-theme';
import type { BookingStatus } from '@/lib/database.types';
import {
  formatBookingWindow,
  formatCentavos,
  listMyBookings,
  type BookingWithCourt,
} from '@/lib/bookings';

function statusStyle(status: BookingStatus, theme: Theme): { bg: string; fg: string; label: string } {
  switch (status) {
    case 'confirmed':
      return { bg: theme.successSoft, fg: theme.successSoftForeground, label: 'Confirmed' };
    case 'pending':
      return { bg: theme.warningSoft, fg: theme.warningSoftForeground, label: 'Pending payment' };
    case 'completed':
      return { bg: theme.neutralSoft, fg: theme.neutralSoftForeground, label: 'Completed' };
    case 'cancelled':
      return { bg: theme.neutralSoft, fg: theme.neutralSoftForeground, label: 'Cancelled' };
  }
}

export default function BookingsScreen() {
  const theme = useTheme();
  const [bookings, setBookings] = useState<BookingWithCourt[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setBookings(await listMyBookings());
      setError(false);
    } catch {
      setError(true);
      setBookings((prev) => prev ?? []);
    }
  }, []);

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
        <FlatList
          data={bookings ?? []}
          keyExtractor={(item) => item.id}
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
            const badge = statusStyle(item.status, theme);
            const timezone = item.courts?.venues?.timezone ?? 'Asia/Manila';
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
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <ThemedText type="caption" style={{ color: badge.fg }}>
                      {badge.label}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText type="small" themeColor="subtle">
                  {formatBookingWindow(item.start_time, item.end_time, timezone)}
                </ThemedText>
                <View style={styles.cardBottom}>
                  <ThemedText type="caption">Code {item.confirmation_code}</ThemedText>
                  <ThemedText type="smallBold">{formatCentavos(item.price_amount)}</ThemedText>
                </View>
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
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.half,
  },
});
