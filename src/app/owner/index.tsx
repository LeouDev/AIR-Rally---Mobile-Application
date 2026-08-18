import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme, type Theme } from '@/hooks/use-theme';
import { formatBookingWindow, formatCentavos } from '@/lib/bookings';
import type { BookingStatus, OwnedVenue } from '@/lib/database.types';
import { getOwnerEarnings, listMyVenues, type OwnerEarnings } from '@/lib/owner';

function statusColors(status: BookingStatus, theme: Theme): { bg: string; fg: string } {
  switch (status) {
    case 'confirmed':
      return { bg: theme.successSoft, fg: theme.successSoftForeground };
    case 'pending':
      return { bg: theme.warningSoft, fg: theme.warningSoftForeground };
    default:
      return { bg: theme.neutralSoft, fg: theme.neutralSoftForeground };
  }
}

/** Read-only owner dashboard: venue picker, what customers have PAID
 * (never "received" — payouts are manual, outside this ledger), and the
 * venue's booking history. The full management surface stays web-only. */
export default function OwnerScreen() {
  const theme = useTheme();
  const [venues, setVenues] = useState<OwnedVenue[] | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [earnings, setEarnings] = useState<OwnerEarnings | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    listMyVenues()
      .then((rows) => {
        setVenues(rows);
        setVenueId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch(() => {
        setVenues([]);
        setError(true);
      });
  }, []);

  const loadEarnings = useCallback((id: string) => {
    setEarnings(null);
    setError(false);
    getOwnerEarnings(id)
      .then(setEarnings)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (venueId) loadEarnings(venueId);
  }, [venueId, loadEarnings]);

  const venue = venues?.find((v) => v.id === venueId) ?? null;
  const upcoming = earnings?.rows
    .filter((r) => r.status !== 'cancelled' && new Date(r.startTime).getTime() > Date.now())
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 8);
  const recent = earnings?.rows.slice(0, 12);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          title: 'Your venues',
          headerTintColor: theme.primary,
          headerTitleStyle: { color: theme.foreground },
          headerStyle: { backgroundColor: theme.background },
        }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {venues === null ? (
          <View style={styles.stack}>
            <Skeleton height={44} radius={Radius.pill} />
            <Skeleton height={110} radius={Radius.xl} />
            <Skeleton height={220} radius={Radius.xl} />
          </View>
        ) : venues.length === 0 ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText type="subtitle">No venues on this account</ThemedText>
            <ThemedText type="small" themeColor="subtle">
              Apply as a venue owner at air-rally.com — the application wizard lives on the web.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.stack}>
            {venues.length > 1 ? (
              <View style={styles.chipRow}>
                {venues.map((v) => {
                  const selected = v.id === venueId;
                  return (
                    <Pressable
                      key={v.id}
                      accessibilityRole="button"
                      onPress={() => setVenueId(v.id)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? theme.primary : theme.card,
                          borderColor: selected ? theme.primary : theme.input,
                        },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        numberOfLines={1}
                        style={{ color: selected ? theme.primaryForeground : theme.cardForeground }}>
                        {v.name}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {venue && venue.status !== 'active' ? (
              <View style={[styles.pillNote, { backgroundColor: theme.warningSoft }]}>
                <ThemedText type="caption" style={{ color: theme.warningSoftForeground }}>
                  This venue is {venue.status} — it isn&apos;t bookable right now.
                </ThemedText>
              </View>
            ) : null}

            {error ? (
              <ThemedText type="small" themeColor="destructive">
                Couldn&apos;t load this venue&apos;s bookings. Reselect it to retry.
              </ThemedText>
            ) : null}

            {earnings === null && !error ? (
              <View style={styles.stack}>
                <Skeleton height={110} radius={Radius.xl} />
                <Skeleton height={220} radius={Radius.xl} />
              </View>
            ) : earnings ? (
              <>
                <View style={[styles.card, { backgroundColor: theme.navy, borderColor: theme.navy }]}>
                  <ThemedText type="small" style={{ color: theme.navyForeground }}>
                    Paid by customers · confirmed bookings
                  </ThemedText>
                  <ThemedText type="heading" style={{ color: theme.navyForeground }}>
                    {formatCentavos(earnings.grossConfirmed)}
                  </ThemedText>
                  <ThemedText type="caption" style={{ color: theme.navyForeground }}>
                    {earnings.upcomingCount} upcoming confirmed{' '}
                    {earnings.upcomingCount === 1 ? 'booking' : 'bookings'}
                    {earnings.refunded > 0
                      ? ` · ${formatCentavos(earnings.refunded)} refunded`
                      : ''}
                    . Payouts are settled separately — this is what customers have paid, not your
                    account balance.
                  </ThemedText>
                </View>

                {upcoming && upcoming.length > 0 ? (
                  <View style={styles.block}>
                    <ThemedText type="subtitle">Upcoming</ThemedText>
                    {upcoming.map((row) => (
                      <BookingRow key={row.bookingId} row={row} venueTz={venue?.timezone} />
                    ))}
                  </View>
                ) : null}

                <View style={styles.block}>
                  <ThemedText type="subtitle">Recent activity</ThemedText>
                  {recent && recent.length > 0 ? (
                    recent.map((row) => (
                      <BookingRow key={row.bookingId} row={row} venueTz={venue?.timezone} />
                    ))
                  ) : (
                    <ThemedText type="small" themeColor="subtle">
                      No bookings yet for this venue.
                    </ThemedText>
                  )}
                </View>
              </>
            ) : null}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function BookingRow({
  row,
  venueTz,
}: {
  row: OwnerEarnings['rows'][number];
  venueTz: string | undefined;
}) {
  const theme = useTheme();
  const colors = statusColors(row.status, theme);
  return (
    <View style={[styles.card, styles.bookingRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.bookingInfo}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {row.courtName}
          <ThemedText type="caption"> · {row.confirmationCode}</ThemedText>
        </ThemedText>
        <ThemedText type="caption">
          {formatBookingWindow(row.startTime, row.endTime, venueTz ?? 'Asia/Manila')}
        </ThemedText>
        {row.refundedAmount > 0 ? (
          <ThemedText type="caption" themeColor="destructive">
            {formatCentavos(row.refundedAmount)} refunded
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.bookingMeta}>
        <View style={[styles.statusPill, { backgroundColor: colors.bg }]}>
          <ThemedText type="caption" style={{ color: colors.fg }}>
            {row.status}
          </ThemedText>
        </View>
        <ThemedText type="smallBold">{formatCentavos(row.priceAmount)}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    minHeight: 40,
    justifyContent: 'center',
    maxWidth: 220,
  },
  pillNote: {
    borderRadius: Radius.lg,
    padding: Spacing.two,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  block: {
    gap: Spacing.two,
  },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  bookingInfo: {
    flexShrink: 1,
    gap: Spacing.half,
  },
  bookingMeta: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  statusPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
});
