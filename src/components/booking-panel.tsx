import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, UIManager, View } from 'react-native';

import { CourtStrip, DateStrip, DurationSegmented, SectionLabel, SlotGrid } from '@/components/booking-picker';
import { PlayerPicker } from '@/components/player-picker';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AvailableSlot, PublicProfile } from '@/lib/database.types';
import {
  calculateBookingCharge,
  DURATION_OPTIONS_MINUTES,
  formatCentavos,
  formatSlotTime,
  getAvailableSlots,
  upcomingDates,
} from '@/lib/bookings';
import { createCheckoutSession } from '@/lib/checkout';
import { createOpenPlayForBooking } from '@/lib/events';
import type { VenueDetail } from '@/lib/venues';
import { useSession } from '@/providers/session';

const VISIBLE_DAYS = 14;

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

/** 150–300ms ease for selection/summary changes — motion with meaning,
 * never longer than a beat. */
function animateNext(): void {
  LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
}

/**
 * The court → date → duration → slot picker on a venue's page, ending in
 * the PayMongo sheet. Slots come from the same get_available_slots RPC
 * the web books through; the session itself is created by the web API
 * (see lib/checkout.ts) so the booking is reserved before payment.
 *
 * Visual language: selection is NAVY ink — orange belongs to exactly one
 * element here, the Reserve & pay action. Courts and days ride in
 * horizontal strips (nothing wraps), duration is a segmented row, and
 * slots group under morning/afternoon/evening so a full day scans in
 * three glances instead of twenty pills.
 */
export function BookingPanel({ venue }: { venue: VenueDetail }) {
  const theme = useTheme();
  const { session } = useSession();
  const dates = useRef(upcomingDates(venue.timezone, VISIBLE_DAYS)).current;

  const [courtId, setCourtId] = useState(venue.courts[0]?.id ?? null);
  const [localDate, setLocalDate] = useState(dates[0]?.localDate ?? '');
  const [duration, setDuration] = useState(DURATION_OPTIONS_MINUTES[0]);
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [slotsError, setSlotsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [players, setPlayers] = useState<PublicProfile[]>([]);
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
        if (seq === requestSeq.current) {
          animateNext();
          setSlots(rows);
        }
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

    // The roster is set up AFTER the booking exists and BEFORE the
    // redirect. Deliberately non-fatal: a failure here must never block a
    // payment the player has already committed to.
    if (players.length > 0 && session?.user.id) {
      try {
        await createOpenPlayForBooking(session.user.id, {
          bookingId,
          playerIds: players.map((p) => p.id),
        });
      } catch {
        setCheckoutError("Booked, but we couldn't invite your players. You can invite them from the game page.");
      }
    }

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
  // What card/QR Ph will actually charge, fee included — never the raw
  // court price. See lib/bookings.ts#calculateBookingCharge: PayMongo's
  // rate applies to the total charged, not the court price, so showing
  // the pre-fee number here would under-report what "Reserve & pay"
  // actually commits to.
  const charge = calculateBookingCharge(Math.round(estimate * 100));

  const pickSlot = (slot: AvailableSlot, selected: boolean) => {
    animateNext();
    setSelectedSlot(selected ? null : slot);
  };

  return (
    <View style={styles.block}>
      <ThemedText type="subtitle">Book a court</ThemedText>

      <SectionLabel text="Court" />
      <CourtStrip courts={venue.courts} selectedId={courtId} onSelect={setCourtId} />

      <SectionLabel text="Date" />
      <DateStrip dates={dates} selectedDate={localDate} onSelect={setLocalDate} />

      <SectionLabel text="Session length" />
      <DurationSegmented options={DURATION_OPTIONS_MINUTES} selected={duration} onSelect={setDuration} />

      <SectionLabel text="Start time" />
      <SlotGrid
        slots={slots}
        selectedSlot={selectedSlot}
        onSelect={pickSlot}
        timezone={venue.timezone}
        emptyMessage={
          slotsError
            ? "Couldn't load times. Check your connection and reselect a date."
            : 'No open times this day — try another day or a shorter session.'
        }
      />

      {selectedSlot ? (
        <View style={[styles.summary, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.summaryText}>
            <ThemedText type="smallBold">
              {court.name} · {hours} {hours === 1 ? 'hour' : 'hours'}
            </ThemedText>
            <ThemedText type="small" themeColor="subtle">
              {formatSlotTime(selectedSlot.slot_start, venue.timezone)} –{' '}
              {formatSlotTime(selectedSlot.slot_end, venue.timezone)}
            </ThemedText>
            <ThemedText type="caption">
              Includes {formatCentavos(charge.processingFeeAmount)} QR Ph fee · waived if paid with credits
            </ThemedText>
          </View>
          <ThemedText type="heading">{formatCentavos(charge.totalChargedAmount)}</ThemedText>
        </View>
      ) : null}

      {selectedSlot ? (
        <PlayerPicker
          selected={players}
          onChange={setPlayers}
          totalAmount={charge.totalChargedAmount}
          excludeUserId={session?.user.id}
        />
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

const styles = StyleSheet.create({
  block: {
    gap: Spacing.two,
  },
  summary: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  summaryText: {
    flexShrink: 1,
    gap: 2,
  },
});
