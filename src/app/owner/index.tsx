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
import { getOwnerAnalytics, getOwnerEarnings, listMyVenues, type OwnerAnalytics, type OwnerEarnings } from '@/lib/owner';
import { useSession } from '@/providers/session';

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

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Payment pending',
  confirmed: 'Paid',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

function formatMoney(amountMinorUnits: number, currency: string): string {
  const symbol = currency === 'PHP' ? '₱' : `${currency} `;
  return `${symbol}${(amountMinorUnits / 100).toFixed(2)}`;
}

function formatPct(value: number | null): string {
  if (value === null) return '—';
  const pct = Math.round(value * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12} ${period}`;
}

/** Read-only owner dashboard: venue picker, an owner-wide analytics
 * overview, what customers have PAID for the selected venue (never
 * "received" — payouts are manual, outside this ledger), and the venue's
 * booking history. The full management surface stays web-only. */
export default function OwnerScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const [venues, setVenues] = useState<OwnedVenue[] | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [earnings, setEarnings] = useState<OwnerEarnings | null>(null);
  const [analytics, setAnalytics] = useState<OwnerAnalytics | null>(null);
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

  useEffect(() => {
    if (!session?.user.id) return;
    getOwnerAnalytics(session.user.id)
      .then(setAnalytics)
      .catch(() => {});
  }, [session?.user.id]);

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
            {analytics ? (
              <View style={styles.block}>
                <ThemedText type="subtitle">Overview</ThemedText>
                <View style={styles.revenueRow}>
                  <RevenueCard label="Today" period={analytics.revenue.today} currency={analytics.currency} />
                  <RevenueCard label="This week" period={analytics.revenue.thisWeek} currency={analytics.currency} />
                  <RevenueCard label="This month" period={analytics.revenue.thisMonth} currency={analytics.currency} />
                </View>

                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <ThemedText type="caption" themeColor="mutedForeground" style={styles.metaLabel}>
                    THIS MONTH
                  </ThemedText>
                  <View style={styles.insightRow}>
                    <ThemedText type="small">
                      {analytics.bookingInsights.totalBookings} {analytics.bookingInsights.totalBookings === 1 ? 'booking' : 'bookings'}
                    </ThemedText>
                    <ThemedText type="small">
                      {analytics.bookingInsights.repeatCustomers} repeat {analytics.bookingInsights.repeatCustomers === 1 ? 'customer' : 'customers'}
                    </ThemedText>
                    <ThemedText type="small">{Math.round(analytics.bookingInsights.cancellationRate * 100)}% cancelled</ThemedText>
                  </View>
                  {analytics.occupancy.peakHour !== null ? (
                    <ThemedText type="caption" themeColor="mutedForeground">
                      Busiest around {formatHour(analytics.occupancy.peakHour)}
                      {analytics.occupancy.lowestHour !== null ? `, quietest around ${formatHour(analytics.occupancy.lowestHour)}` : ''}
                    </ThemedText>
                  ) : null}
                </View>

                {analytics.occupancy.perCourt.length > 0 ? (
                  <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <ThemedText type="caption" themeColor="mutedForeground" style={styles.metaLabel}>
                      OCCUPANCY THIS MONTH
                    </ThemedText>
                    {analytics.occupancy.perCourt.map((court) => (
                      <View key={court.courtId} style={styles.occupancyRow}>
                        <ThemedText type="small" numberOfLines={1} style={styles.occupancyName}>
                          {court.courtName}
                        </ThemedText>
                        <ThemedText type="smallBold">
                          {court.occupancyPct === null ? '—' : `${Math.round(court.occupancyPct * 100)}%`}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                ) : null}

                {analytics.occupancy.mostBookedCourts.length > 0 ? (
                  <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <ThemedText type="caption" themeColor="mutedForeground" style={styles.metaLabel}>
                      MOST BOOKED
                    </ThemedText>
                    {analytics.occupancy.mostBookedCourts.map((court) => (
                      <View key={court.courtId} style={styles.occupancyRow}>
                        <ThemedText type="small" numberOfLines={1} style={styles.occupancyName}>
                          {court.courtName}
                        </ThemedText>
                        <ThemedText type="smallBold">
                          {court.bookingCount} {court.bookingCount === 1 ? 'booking' : 'bookings'}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

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
                <View style={[styles.warningCard, { backgroundColor: theme.warningSoft, borderColor: theme.warning }]}>
                  <ThemedText type="small" style={{ color: theme.warningSoftForeground }}>
                    <ThemedText type="smallBold" style={{ color: theme.warningSoftForeground }}>
                      This is not a statement of funds paid out to you.
                    </ThemedText>{' '}
                    A booking showing as &quot;Paid&quot; means the customer&apos;s payment succeeded — it does not mean
                    AIR/Rally has settled or transferred any amount to you. Payout automation is not yet live;
                    contact AIR/Rally directly about compensation for confirmed bookings. The same applies to any
                    refund figure below: it reflects what PayMongo&apos;s own refund response reported, not a
                    confirmed debit from your bank account.
                  </ThemedText>
                </View>

                <View style={[styles.card, { backgroundColor: theme.navy, borderColor: theme.navy }]}>
                  <ThemedText type="small" style={{ color: theme.navyForeground }}>
                    Customer payments (confirmed)
                  </ThemedText>
                  <ThemedText type="heading" style={{ color: theme.navyForeground }}>
                    {formatCentavos(earnings.grossConfirmed)}
                  </ThemedText>
                  <ThemedText type="caption" style={{ color: theme.navyForeground }}>
                    {earnings.upcomingCount} upcoming confirmed{' '}
                    {earnings.upcomingCount === 1 ? 'booking' : 'bookings'}
                    {earnings.refunded > 0 ? ` · ${formatCentavos(earnings.refunded)} refunded` : ''}
                    {earnings.splitVenueAmount > 0
                      ? ` · ${formatCentavos(earnings.splitVenueAmount)} requested venue split (unsettled)`
                      : ''}
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

function RevenueCard({
  label,
  period,
  currency,
}: {
  label: string;
  period: { amount: number; changePct: number | null };
  currency: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.revenueCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <ThemedText type="caption" themeColor="mutedForeground">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{formatMoney(period.amount, currency)}</ThemedText>
      <ThemedText
        type="caption"
        themeColor={period.changePct === null ? 'mutedForeground' : period.changePct >= 0 ? 'success' : 'destructive'}>
        {formatPct(period.changePct)}
      </ThemedText>
    </View>
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
        <View style={styles.badgeRow}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {row.courtName}
            <ThemedText type="caption"> · {row.confirmationCode}</ThemedText>
          </ThemedText>
        </View>
        <ThemedText type="caption">
          {formatBookingWindow(row.startTime, row.endTime, venueTz ?? 'Asia/Manila')} · {row.paymentProvider}
        </ThemedText>
        <View style={styles.badgeRow}>
          {row.wasRescheduled ? (
            <View style={[styles.miniBadge, { backgroundColor: theme.neutralSoft }]}>
              <ThemedText type="caption" style={{ color: theme.neutralSoftForeground }}>
                Rescheduled
              </ThemedText>
            </View>
          ) : null}
          {row.isRescheduleReplacement ? (
            <View style={[styles.miniBadge, { backgroundColor: theme.neutralSoft }]}>
              <ThemedText type="caption" style={{ color: theme.neutralSoftForeground }}>
                From reschedule
              </ThemedText>
            </View>
          ) : null}
        </View>
        {row.refundedAmount > 0 ? (
          <ThemedText type="caption" themeColor="destructive">
            {formatCentavos(row.refundedAmount)} refunded
          </ThemedText>
        ) : null}
        {row.venueAmount != null ? (
          <ThemedText type="caption" themeColor="mutedForeground">
            Requested split: {formatMoney(row.venueAmount, row.currency)}
          </ThemedText>
        ) : null}
        {row.venueRefundAmount != null && row.venueAmount != null ? (
          <ThemedText type="caption" themeColor="mutedForeground">
            Refund impact: {formatMoney(row.venueRefundAmount, row.currency)}
            {row.venueRefundAmount !== row.venueAmount ? (
              <ThemedText type="caption" themeColor="destructive">
                {' '}
                (not equal to your original share)
              </ThemedText>
            ) : null}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.bookingMeta}>
        <View style={[styles.statusPill, { backgroundColor: colors.bg }]}>
          <ThemedText type="caption" style={{ color: colors.fg }}>
            {STATUS_LABELS[row.status]}
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
  block: {
    gap: Spacing.two,
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
  warningCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  metaLabel: {
    letterSpacing: 1.2,
  },
  revenueRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  revenueCard: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.two,
    gap: 2,
  },
  insightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  occupancyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.half,
  },
  occupancyName: {
    flexShrink: 1,
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
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    alignItems: 'center',
  },
  miniBadge: {
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
    borderRadius: Radius.sm,
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
