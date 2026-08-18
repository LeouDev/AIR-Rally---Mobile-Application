import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatBookingWindow,
  formatCentavos,
  getBookingWithCourt,
  type BookingWithCourt,
} from '@/lib/bookings';

/** How long to keep polling a pending booking before assuming the payment
 * isn't coming through this sitting — matches the web's in-flight window
 * (PAYMONGO_PAYMENT_IN_FLIGHT_WINDOW_MINUTES is 10; we poll for 3 which
 * covers the overwhelmingly common webhook latency of seconds). */
const POLL_INTERVAL_MS = 3000;
const POLL_BUDGET_MS = 3 * 60 * 1000;

export default function BookingStatusScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<BookingWithCourt | null | undefined>(undefined);
  const pollUntil = useRef(Date.now() + POLL_BUDGET_MS);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const row = await getBookingWithCourt(id);
        if (cancelled) return;
        setBooking(row);
        // A pending booking is a payment racing the webhook — keep
        // watching until it resolves or the budget runs out.
        if (row?.status === 'pending' && Date.now() < pollUntil.current) {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled) setBooking((prev) => (prev === undefined ? null : prev));
      }
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  const timezone = booking?.courts?.venues?.timezone ?? 'Asia/Manila';
  const totalCharged =
    booking !== undefined && booking !== null
      ? booking.price_amount - booking.credit_amount_applied + booking.processing_fee_amount
      : 0;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          title: 'Booking',
          headerTintColor: theme.primary,
          headerTitleStyle: { color: theme.foreground },
          headerStyle: { backgroundColor: theme.background },
        }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {booking === undefined ? (
          <View style={styles.stack}>
            <Skeleton height={120} radius={Radius.xl} />
            <Skeleton height={200} radius={Radius.xl} />
          </View>
        ) : booking === null ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText type="subtitle">Booking not found</ThemedText>
            <ThemedText type="small" themeColor="subtle">
              It may belong to a different account.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.stack}>
            {booking.status === 'pending' ? (
              <View
                style={[styles.card, { backgroundColor: theme.warningSoft, borderColor: theme.warningSoft }]}>
                <ThemedText type="subtitle" style={{ color: theme.warningSoftForeground }}>
                  Waiting for payment confirmation
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.warningSoftForeground }}>
                  If you just paid, this updates the moment PayMongo confirms — usually within
                  seconds. If you didn&apos;t finish paying, the slot releases automatically and
                  nothing is charged.
                </ThemedText>
              </View>
            ) : booking.status === 'confirmed' ? (
              <View
                style={[styles.card, { backgroundColor: theme.successSoft, borderColor: theme.successSoft }]}>
                <ThemedText type="subtitle" style={{ color: theme.successSoftForeground }}>
                  Booking confirmed
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.successSoftForeground }}>
                  Show this code at the venue.
                </ThemedText>
                <ThemedText type="heading" style={{ color: theme.successSoftForeground }}>
                  {booking.confirmation_code}
                </ThemedText>
              </View>
            ) : (
              <View
                style={[styles.card, { backgroundColor: theme.neutralSoft, borderColor: theme.neutralSoft }]}>
                <ThemedText type="subtitle" style={{ color: theme.neutralSoftForeground }}>
                  {booking.status === 'cancelled' ? 'Booking cancelled' : 'Booking completed'}
                </ThemedText>
                {booking.status === 'cancelled' ? (
                  <ThemedText type="small" style={{ color: theme.neutralSoftForeground }}>
                    The slot was released.{booking.paid_at ? '' : ' Nothing was charged.'}
                  </ThemedText>
                ) : null}
              </View>
            )}

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText type="subtitle">
                {booking.courts?.venues?.name ?? 'Venue'} · {booking.courts?.name ?? 'Court'}
              </ThemedText>
              <ThemedText type="small" themeColor="subtle">
                {formatBookingWindow(booking.start_time, booking.end_time, timezone)}
              </ThemedText>

              <View style={styles.divider} />

              <Row label="Court price" value={formatCentavos(booking.price_amount)} />
              {booking.credit_amount_applied > 0 ? (
                <Row
                  label="AIR/Rally Credits applied"
                  value={`−${formatCentavos(booking.credit_amount_applied)}`}
                />
              ) : null}
              {booking.processing_fee_amount > 0 ? (
                <Row
                  label="Payment processing fee"
                  value={formatCentavos(booking.processing_fee_amount)}
                />
              ) : null}
              <Row label="Total" value={formatCentavos(Math.max(totalCharged, 0))} bold />
            </View>

            <Button title="See my bookings" onPress={() => router.replace('/(tabs)/bookings')} />
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <ThemedText type={bold ? 'smallBold' : 'small'} themeColor={bold ? undefined : 'subtle'}>
        {label}
      </ThemedText>
      <ThemedText type={bold ? 'smallBold' : 'small'}>{value}</ThemedText>
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
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  divider: {
    height: 1,
    opacity: 0.15,
    backgroundColor: '#000',
    marginVertical: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
