import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AvailableSlot } from '@/lib/database.types';
import {
  DURATION_OPTIONS_MINUTES,
  formatSlotTime,
  getAvailableSlots,
  upcomingDates,
} from '@/lib/bookings';
import { createCheckoutSession } from '@/lib/checkout';
import type { VenueDetail } from '@/lib/venues';

const VISIBLE_DAYS = 7;

/** The court → date → duration → slot picker on a venue's page, ending in
 * the PayMongo sheet. Slots come from the same get_available_slots RPC
 * the web books through; the session itself is created by the web API
 * (see lib/checkout.ts) so the booking is reserved before payment. */
export function BookingPanel({ venue }: { venue: VenueDetail }) {
  const theme = useTheme();
  const dates = useRef(upcomingDates(venue.timezone, VISIBLE_DAYS)).current;

  const [courtId, setCourtId] = useState(venue.courts[0]?.id ?? null);
  const [localDate, setLocalDate] = useState(dates[0]?.localDate ?? '');
  const [duration, setDuration] = useState(DURATION_OPTIONS_MINUTES[0]);
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [slotsError, setSlotsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const court = venue.courts.find((c) => c.id === courtId) ?? null;

  useEffect(() => {
    if (!courtId || !localDate) return;
    const seq = ++requestSeq.current;
    setSlots(null);
    setSelectedSlot(null);
    setSlotsError(false);
    getAvailableSlots(courtId, localDate, duration)
      .then((rows) => {
        if (seq === requestSeq.current) setSlots(rows);
      })
      .catch(() => {
        if (seq === requestSeq.current) {
          setSlots([]);
          setSlotsError(true);
        }
      });
  }, [courtId, localDate, duration]);

  const book = useCallback(async () => {
    if (!selectedSlot || submitting) return;
    setSubmitting(true);
    setCheckoutError(null);

    const result = await createCheckoutSession({
      courtId: courtId!,
      startTime: selectedSlot.slot_start,
      endTime: selectedSlot.slot_end,
    });

    if (!result.success) {
      setCheckoutError(result.error);
      setSubmitting(false);
      // The slot may have been taken while choosing — refresh the grid.
      const seq = ++requestSeq.current;
      getAvailableSlots(courtId!, localDate, duration)
        .then((rows) => {
          if (seq === requestSeq.current) {
            setSlots(rows);
            setSelectedSlot(null);
          }
        })
        .catch(() => {});
      return;
    }

    const { bookingId, amountDue, url } = result.data;

    if (amountDue > 0) {
      if (Platform.OS === 'web') {
        // Dev-harness behaviour only (the product surface is native): a
        // popup after an async gap gets blocked, so navigate this tab to
        // PayMongo outright. The Bookings tab shows the outcome on return.
        window.location.assign(url);
        return;
      }
      // PayMongo checkout in an in-app browser sheet; the /payment-return
      // page deep-links back and closes it. Whatever way the sheet ends —
      // paid, cancelled, or swiped away — the status screen resolves the
      // truth by polling the booking row itself.
      await WebBrowser.openAuthSessionAsync(url, 'airrally://payment-return');
    }

    setSubmitting(false);
    router.push({ pathname: '/booking/[id]', params: { id: bookingId } });
  }, [selectedSlot, submitting, courtId, localDate, duration]);

  if (venue.courts.length === 0 || !court) return null;

  const hours = duration / 60;
  const estimate = court.hourly_price * hours;

  return (
    <View style={styles.block}>
      <ThemedText type="subtitle">Book a court</ThemedText>

      <ChipRow>
        {venue.courts.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            sublabel={`₱${c.hourly_price}/hr`}
            selected={c.id === courtId}
            onPress={() => setCourtId(c.id)}
          />
        ))}
      </ChipRow>

      <ChipRow>
        {dates.map((d) => (
          <Chip
            key={d.localDate}
            label={d.label}
            sublabel={d.weekday}
            selected={d.localDate === localDate}
            onPress={() => setLocalDate(d.localDate)}
          />
        ))}
      </ChipRow>

      <ChipRow>
        {DURATION_OPTIONS_MINUTES.map((m) => (
          <Chip
            key={m}
            label={`${m / 60} ${m === 60 ? 'hour' : 'hours'}`}
            selected={m === duration}
            onPress={() => setDuration(m)}
          />
        ))}
      </ChipRow>

      {slots === null ? (
        <View style={styles.slotWrap}>
          <Skeleton height={44} width={100} radius={Radius.pill} />
          <Skeleton height={44} width={100} radius={Radius.pill} />
          <Skeleton height={44} width={100} radius={Radius.pill} />
        </View>
      ) : slots.length === 0 ? (
        <ThemedText type="small" themeColor="subtle">
          {slotsError
            ? "Couldn't load times. Check your connection and reselect a date."
            : 'No open times for this day and duration — try another day or a shorter session.'}
        </ThemedText>
      ) : (
        <View style={styles.slotWrap}>
          {slots.map((slot) => {
            const selected = selectedSlot?.slot_start === slot.slot_start;
            return (
              <Pressable
                key={slot.slot_start}
                accessibilityRole="button"
                onPress={() => setSelectedSlot(selected ? null : slot)}
                style={[
                  styles.slot,
                  {
                    backgroundColor: selected ? theme.primary : theme.card,
                    borderColor: selected ? theme.primary : theme.input,
                  },
                ]}>
                <ThemedText
                  type="smallBold"
                  style={{ color: selected ? theme.primaryForeground : theme.cardForeground }}>
                  {formatSlotTime(slot.slot_start, venue.timezone)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}

      {selectedSlot ? (
        <View style={[styles.summary, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.summaryRow}>
            <ThemedText type="small" themeColor="subtle">
              {court.name} · {hours} {hours === 1 ? 'hour' : 'hours'}
            </ThemedText>
            <ThemedText type="smallBold">
              {formatSlotTime(selectedSlot.slot_start, venue.timezone)} –{' '}
              {formatSlotTime(selectedSlot.slot_end, venue.timezone)}
            </ThemedText>
          </View>
          <View style={styles.summaryRow}>
            <ThemedText type="small" themeColor="subtle">
              Court price
            </ThemedText>
            <ThemedText type="smallBold">₱{estimate.toLocaleString('en-PH')}</ThemedText>
          </View>
          <ThemedText type="caption">
            Credits in your wallet apply automatically. Payment is via QR Ph; a small processing fee
            may be added at checkout.
          </ThemedText>
        </View>
      ) : null}

      {checkoutError ? (
        <ThemedText type="small" themeColor="destructive">
          {checkoutError}
        </ThemedText>
      ) : null}

      <Button
        title={submitting ? 'Reserving…' : 'Reserve & pay'}
        onPress={book}
        disabled={!selectedSlot || submitting}
        loading={submitting}
      />
    </View>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

function Chip({
  label,
  sublabel,
  selected,
  onPress,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.card,
          borderColor: selected ? theme.primary : theme.input,
        },
      ]}>
      <ThemedText
        type="smallBold"
        style={{ color: selected ? theme.primaryForeground : theme.cardForeground }}>
        {label}
      </ThemedText>
      {sublabel ? (
        <ThemedText
          type="caption"
          style={{ color: selected ? theme.primaryForeground : theme.mutedForeground }}>
          {sublabel}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.three,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    minWidth: 72,
  },
  slotWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  slot: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
    justifyContent: 'center',
  },
  summary: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
