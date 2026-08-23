import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

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
import { cancelBookingViaApi, type CancelOutcome } from '@/lib/checkout';

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

  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [creditOutcome, setCreditOutcome] = useState<CancelOutcome['credit'] | null>(null);

  const timezone = booking?.courts?.venues?.timezone ?? 'Asia/Manila';
  const totalCharged =
    booking !== undefined && booking !== null
      ? booking.price_amount - booking.credit_amount_applied + booking.processing_fee_amount
      : 0;

  // Mirrors the server's own rules so the button only shows when the
  // cancel can succeed: pending always; confirmed only when it used no
  // credits (credit bookings are final) and hasn't started.
  // The server owns the real rules (24h cutoff, once per booking, same
  // venue). This only decides whether to OFFER the button; the
  // reschedule screen asks the API and explains any refusal in full.
  const maybeReschedulable =
    booking != null &&
    booking.status === 'confirmed' &&
    new Date(booking.start_time).getTime() > Date.now();

  const cancellable =
    booking != null &&
    (booking.status === 'pending' ||
      (booking.status === 'confirmed' &&
        booking.credit_amount_applied === 0 &&
        new Date(booking.start_time).getTime() > Date.now()));

  // Narrower than !cancellable on purpose: a past or already-cancelled
  // booking isn't cancellable either, but blaming credits there would be
  // wrong. This is specifically the case that used to render nothing at
  // all — a confirmed, still-upcoming booking that credits made final —
  // where "absent" reads as "broken", not "not applicable".
  // Reuses maybeReschedulable's own condition (confirmed + still
  // upcoming) rather than recomputing Date.now() a second time.
  const nonCancellableDueToCredit = maybeReschedulable && booking!.credit_amount_applied > 0;

  // A pending PayMongo booking's checkout page stays reachable: the
  // session's public URL is its id sans the "cs_" prefix (observed to
  // hold for every session this project has created; revisit if PayMongo
  // ever changes their URL scheme). Lets someone who closed the sheet
  // finish paying instead of stranding the reservation.
  const resumePaymentUrl =
    booking?.status === 'pending' &&
    booking.payment_provider === 'paymongo' &&
    booking.paymongo_checkout_session_id
      ? `https://checkout.paymongo.com/${booking.paymongo_checkout_session_id.replace(/^cs_/, '')}`
      : null;

  const resumePayment = async () => {
    if (!resumePaymentUrl) return;
    if (Platform.OS === 'web') {
      window.location.assign(resumePaymentUrl);
      return;
    }
    await WebBrowser.openAuthSessionAsync(resumePaymentUrl, 'airrally://payment-return');
    // Whatever way the sheet closed, the poll above resolves the truth.
  };

  const performCancel = async () => {
    if (!booking || cancelling) return;
    setCancelling(true);
    setCancelError(null);
    const result = await cancelBookingViaApi(booking.id);
    setCancelling(false);
    if (!result.success) {
      setCancelError(result.error);
      return;
    }
    setConfirmingCancel(false);
    setCreditOutcome(result.data.credit);
    setBooking({ ...booking, status: 'cancelled' });
  };

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
                {resumePaymentUrl ? (
                  <Button title="Complete payment" onPress={resumePayment} />
                ) : null}
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

              <View style={[styles.divider, { backgroundColor: theme.hairline }]} />

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
              {maybeReschedulable ? (
                <ThemedText type="caption" themeColor="mutedForeground" style={styles.policyNote}>
                  {booking.credit_amount_applied > 0
                    ? "This booking used AIR/Rally Credits, which makes it final — it can't be cancelled and the Credits are not returned."
                    : 'Cancelling at least 48 hours ahead earns AIR/Rally Credits for what you paid; closer than that, no compensation is due.'}
                </ThemedText>
              ) : null}
            </View>

            {creditOutcome ? (
              <View
                style={[
                  styles.card,
                  creditOutcome.issued
                    ? { backgroundColor: theme.successSoft, borderColor: theme.successSoft }
                    : { backgroundColor: theme.neutralSoft, borderColor: theme.neutralSoft },
                ]}>
                <ThemedText
                  type="smallBold"
                  style={{
                    color: creditOutcome.issued
                      ? theme.successSoftForeground
                      : theme.neutralSoftForeground,
                  }}>
                  {creditOutcome.issued
                    ? `${formatCentavos(creditOutcome.amount)} in AIR/Rally Credits added to your wallet`
                    : 'About your payment'}
                </ThemedText>
                <ThemedText
                  type="small"
                  style={{
                    color: creditOutcome.issued
                      ? theme.successSoftForeground
                      : theme.neutralSoftForeground,
                  }}>
                  {creditOutcome.reason}
                </ThemedText>
              </View>
            ) : null}

            {cancellable ? (
              confirmingCancel ? (
                <View
                  style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <ThemedText type="smallBold">Cancel this booking?</ThemedText>
                  <ThemedText type="small" themeColor="subtle">
                    {booking.status === 'pending'
                      ? 'The slot is released immediately and nothing is charged.'
                      : 'Cancelling at least 48 hours ahead earns AIR/Rally Credits for what you paid; closer than that, no compensation is due.'}
                  </ThemedText>
                  {cancelError ? (
                    <ThemedText type="small" themeColor="destructive">
                      {cancelError}
                    </ThemedText>
                  ) : null}
                  <View style={styles.confirmRow}>
                    <View style={styles.confirmButton}>
                      <Button
                        title="Keep booking"
                        variant="secondary"
                        onPress={() => setConfirmingCancel(false)}
                        disabled={cancelling}
                      />
                    </View>
                    <View style={styles.confirmButton}>
                      <Button
                        title={cancelling ? 'Cancelling…' : 'Yes, cancel'}
                        onPress={performCancel}
                        loading={cancelling}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <Button
                  title="Cancel booking"
                  variant="ghost"
                  onPress={() => setConfirmingCancel(true)}
                />
              )
            ) : nonCancellableDueToCredit ? (
              // Disabled, not absent. A missing control and a denied one
              // look identical until a customer wonders which — this
              // says which, in the same caption style TextField uses for
              // an inline error, and reuses the rationale that was
              // already spelled out above the price breakdown.
              <View>
                <Button title="Cancel booking" variant="ghost" onPress={() => {}} disabled />
                <ThemedText type="caption" themeColor="mutedForeground" style={styles.disabledActionNote}>
                  Can&apos;t be cancelled — paid with AIR/Rally Credits.
                </ThemedText>
              </View>
            ) : null}

            {maybeReschedulable && !nonCancellableDueToCredit ? (
              <Button
                title="Reschedule"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/booking/[id]/reschedule', params: { id: booking.id } })
                }
              />
            ) : nonCancellableDueToCredit ? (
              // Same reasoning as the disabled Cancel control just above:
              // the server now refuses this exact request (a Credit-paid
              // confirmed→cancelled transition, which is what a
              // reschedule is under the hood), so offering an enabled
              // button here would be a request the customer can tap that
              // is guaranteed to fail with no explanation on screen.
              <View>
                <Button title="Reschedule" variant="secondary" onPress={() => {}} disabled />
                <ThemedText type="caption" themeColor="mutedForeground" style={styles.disabledActionNote}>
                  Can&apos;t be rescheduled — paid with AIR/Rally Credits.
                </ThemedText>
              </View>
            ) : null}

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
  policyNote: {
    marginTop: Spacing.one,
  },
  disabledActionNote: {
    marginTop: -Spacing.one,
  },
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
    marginVertical: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  confirmButton: {
    flex: 1,
  },
});
