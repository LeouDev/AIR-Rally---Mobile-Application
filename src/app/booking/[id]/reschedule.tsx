import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { CourtStrip, DateStrip, SectionLabel, SlotGrid } from '@/components/booking-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AvailableSlot } from '@/lib/database.types';
import { formatCentavos, getAvailableSlots, upcomingDates } from '@/lib/bookings';
import {
  createReschedule,
  getRescheduleAvailability,
  type RescheduleOptions,
} from '@/lib/checkout';

const VISIBLE_DAYS = 14;

/**
 * Move a confirmed booking to another time. V1 rules are the server's,
 * not restated here: same venue, same duration, at least 24 hours out,
 * once per booking. This screen asks the API what's allowed and renders
 * the answer.
 *
 * The price difference is previewed before submitting, because "you owe
 * ₱200 more" should never be a surprise that arrives as a payment sheet.
 */
export default function RescheduleScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [options, setOptions] = useState<RescheduleOptions | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [courtId, setCourtId] = useState<string | null>(null);
  const [localDate, setLocalDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const slotSeq = useRef(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getRescheduleAvailability(id).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setLoadError(result.error);
        return;
      }
      if (!result.data.eligible || !result.data.options) {
        setBlockedMessage(result.data.message ?? "This booking can't be rescheduled.");
        return;
      }
      const opts = result.data.options;
      setOptions(opts);
      setCourtId(opts.courts[0]?.id ?? null);
      setLocalDate(upcomingDates(opts.venueTimezone, VISIBLE_DAYS)[0]?.localDate ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!courtId || !localDate || !options) return;
    const seq = ++slotSeq.current;
    setSlots(null);
    setSelectedSlot(null);
    // Duration is fixed to the original booking's — V1 lets you change
    // when and which court, not how long.
    getAvailableSlots(courtId, localDate, options.originalDurationMinutes)
      .then((rows) => {
        if (seq === slotSeq.current) setSlots(rows);
      })
      .catch(() => {
        if (seq === slotSeq.current) setSlots([]);
      });
  }, [courtId, localDate, options]);

  const submit = useCallback(async () => {
    if (!selectedSlot || !courtId || !id || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const result = await createReschedule({
      bookingId: id,
      newCourtId: courtId,
      newStartTime: selectedSlot.slot_start,
      newEndTime: selectedSlot.slot_end,
    });

    if (!result.success) {
      setSubmitError(result.error);
      setSubmitting(false);
      return;
    }

    const { kind, newBookingId, checkoutUrl } = result.data;

    if (kind === 'provider_unavailable') {
      setSubmitError(
        'Payments are temporarily unavailable, so nothing was changed. Your original booking is untouched — try again shortly.'
      );
      setSubmitting(false);
      return;
    }

    if (kind === 'checkout_required' && checkoutUrl) {
      if (Platform.OS === 'web') {
        window.location.assign(checkoutUrl);
        return;
      }
      await WebBrowser.openAuthSessionAsync(checkoutUrl, 'airrally://payment-return');
    }

    setSubmitting(false);
    // Either way the replacement booking is where the truth now lives,
    // and its own screen polls for the real status.
    router.replace({ pathname: '/booking/[id]', params: { id: newBookingId } });
  }, [selectedSlot, courtId, id, submitting]);

  const court = options?.courts.find((c) => c.id === courtId) ?? null;
  const hours = (options?.originalDurationMinutes ?? 60) / 60;
  const newPrice = court ? court.hourly_price * hours * 100 : null;
  const difference =
    newPrice !== null && options ? newPrice - options.originalPriceAmount : null;

  const dates = options ? upcomingDates(options.venueTimezone, VISIBLE_DAYS) : [];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          title: 'Reschedule',
          headerTintColor: theme.primary,
          headerTitleStyle: { color: theme.foreground },
          headerStyle: { backgroundColor: theme.background },
        }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {loadError ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText type="subtitle">Couldn&apos;t load</ThemedText>
            <ThemedText type="small" themeColor="subtle">
              {loadError}
            </ThemedText>
          </View>
        ) : blockedMessage ? (
          <View
            style={[styles.card, { backgroundColor: theme.neutralSoft, borderColor: theme.neutralSoft }]}>
            <ThemedText type="subtitle" style={{ color: theme.neutralSoftForeground }}>
              Can&apos;t reschedule this booking
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.neutralSoftForeground }}>
              {blockedMessage}
            </ThemedText>
          </View>
        ) : !options ? (
          <View style={styles.stack}>
            <Skeleton height={70} radius={Radius.xl} />
            <Skeleton height={62} radius={Radius.lg} />
            <Skeleton height={180} radius={Radius.xl} />
          </View>
        ) : (
          <View style={styles.stack}>
            <ThemedText type="small" themeColor="subtle">
              Moving your {hours}-hour booking at {options.venueName}. Same venue and length — pick a
              new court or time.
            </ThemedText>

            <SectionLabel text="Court" />
            <CourtStrip courts={options.courts} selectedId={courtId} onSelect={setCourtId} />

            <SectionLabel text="Date" />
            <DateStrip dates={dates} selectedDate={localDate} onSelect={setLocalDate} />

            <SectionLabel text="New start time" />
            <SlotGrid
              slots={slots}
              selectedSlot={selectedSlot}
              onSelect={(slot, selected) => setSelectedSlot(selected ? null : slot)}
              timezone={options.venueTimezone}
              emptyMessage="Nothing open on this court that day — try another date or court."
            />

            {selectedSlot && difference !== null ? (
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Row label="Original booking" value={formatCentavos(options.originalPriceAmount)} />
                <Row label="New booking" value={formatCentavos(newPrice ?? 0)} />
                <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
                {difference > 0 ? (
                  <>
                    <Row label="To pay now" value={formatCentavos(difference)} bold />
                    <ThemedText type="caption">
                      You&apos;ll be taken to PayMongo for the difference. Your original booking stays
                      put until that payment succeeds.
                    </ThemedText>
                  </>
                ) : difference < 0 ? (
                  <>
                    <Row label="Refunded to you" value={formatCentavos(-difference)} bold />
                    <ThemedText type="caption">
                      The difference goes back to your original payment method.
                    </ThemedText>
                  </>
                ) : (
                  <>
                    <Row label="Nothing more to pay" value="₱0" bold />
                    <ThemedText type="caption">Same price — no payment needed.</ThemedText>
                  </>
                )}
              </View>
            ) : null}

            {submitError ? (
              <ThemedText type="small" themeColor="destructive">
                {submitError}
              </ThemedText>
            ) : null}

            <Button
              title={submitting ? 'Rescheduling…' : 'Confirm new time'}
              onPress={submit}
              disabled={!selectedSlot || submitting}
              loading={submitting}
            />
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
  container: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  stack: { gap: Spacing.two },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  divider: { height: 1, marginVertical: Spacing.one },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
});
