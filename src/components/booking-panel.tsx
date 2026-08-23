import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, LayoutAnimation, Platform, StyleSheet, UIManager, View } from 'react-native';

import { CourtStrip, DateStrip, DurationSegmented, SectionLabel, SlotGrid } from '@/components/booking-picker';
import { PlayerPicker } from '@/components/player-picker';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AvailableSlot, PublicProfile } from '@/lib/database.types';
import { previewBookingWithCredits } from '@/lib/booking-credit-preview';
import {
  DURATION_OPTIONS_MINUTES,
  formatCentavos,
  formatSlotTime,
  getAvailableSlots,
  upcomingDates,
} from '@/lib/bookings';
import { createCheckoutSession } from '@/lib/checkout';
import { getCreditBalance } from '@/lib/credits';
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
  const { show } = useToast();
  const dates = useRef(upcomingDates(venue.timezone, VISIBLE_DAYS)).current;

  // Read up front, before any tap — the checkout response arrives only
  // after the server has already debited the wallet, so showing THAT
  // number would be a receipt, not a warning. Disclosure has to precede
  // the commitment, which means knowing the balance before it.
  const [creditBalance, setCreditBalance] = useState(0);
  useEffect(() => {
    const userId = session?.user.id;
    // No reset-to-zero branch here: this screen sits behind the auth
    // guard in the root layout, so a mount with no session is not a
    // real transition to defend against, and the initial state above is
    // already 0 — a synchronous setState here would only be restating
    // the value React already holds.
    if (!userId) return;
    let cancelled = false;
    getCreditBalance(userId)
      .then((balance) => {
        if (!cancelled) setCreditBalance(balance);
      })
      .catch(() => {
        // A read failure must never overstate the disclosure — showing
        // "credits will be applied" for a balance the request couldn't
        // confirm would be worse than showing none. Silence here is
        // conservative, not careless: the server's own split still runs
        // as normal at checkout regardless of what this preview knows.
        if (!cancelled) setCreditBalance(0);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

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
  // `submitting` cannot gate a double tap on its own: setState is async,
  // so two presses landing in the same tick both read the pre-update
  // value and both reach createCheckoutSession. A ref flips synchronously
  // on the first one. Whether that would actually double-charge depends
  // on /api/mobile/checkout being idempotent — a question for the web
  // repo — but the client should not be the reason we find out.
  const inFlight = useRef(false);

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
    if (!selectedSlot || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setCheckoutError(null);

    const result = await createCheckoutSession({
      courtId: courtId!,
      startTime: selectedSlot.slot_start,
      endTime: selectedSlot.slot_end,
    });

    if (!result.success) {
      inFlight.current = false;
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
        // Routed through the toast, NOT setCheckoutError: this component
        // unmounts a few lines below when we navigate to the booking
        // screen, so a message written into its own state is never seen.
        // That left the exact failure this whole fix exists to remove —
        // invites disappearing with nothing on screen to say so. The
        // toast is rendered by ToastProvider above the navigator, so it
        // survives the transition and lands on the destination.
        show("Booked — but we couldn't invite your players. Add them from the game page.", 'error');
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

    inFlight.current = false;
    setSubmitting(false);
    router.push({ pathname: '/booking/[id]', params: { id: bookingId } });
    // `players` and `session` belong here as much as the slot does.
    // PlayerPicker only renders once a slot is chosen, so adding
    // playmates never changes any of the other dependencies — omitting
    // them left this callback closed over the empty roster it was built
    // with, and every invite was silently dropped on the normal path
    // (it only worked if you happened to re-tap a slot afterwards).
    // The whole `session` object, not `session?.user.id`: React Compiler
    // infers the former and skips optimizing the component entirely when
    // a manual dependency is narrower than what it inferred.
  }, [selectedSlot, submitting, courtId, localDate, duration, players, session, show]);

  if (venue.courts.length === 0 || !court) return null;

  const hours = duration / 60;
  const estimate = court.hourly_price * hours;
  // What card/QR Ph will actually charge, fee included, AFTER any
  // AIR/Rally Credits are applied — never the raw court price, and never
  // the pre-credit total either. The processing fee is grossed up from
  // what's left after credit, not the full price (see
  // booking-credit-preview.ts), so a partial-credit booking's fee is
  // smaller than the full-price fee would suggest. Showing the pre-credit
  // number here is exactly the bug this file exists to fix: a player
  // with a balance sees a price that doesn't match what they're charged.
  const preview = previewBookingWithCredits(Math.round(estimate * 100), creditBalance);
  const charge = preview.charge;

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
            {preview.creditApplied > 0 ? (
              // Disclosed BEFORE the tap, not after: the checkout
              // response only arrives once the server has already
              // debited the wallet, so showing that number there would
              // be a receipt, not a warning. This is the warning.
              <>
                <ThemedText type="caption">
                  {formatCentavos(preview.creditApplied)} of your Credits will be applied
                </ThemedText>
                <ThemedText type="caption" themeColor="destructive">
                  {preview.fullyCoveredByCredit
                    ? "Fully covered — no payment needed. Bookings paid with Credits can't be cancelled."
                    : `You'll pay ${formatCentavos(charge.totalChargedAmount)} now. Bookings paid with Credits can't be cancelled.`}
                </ThemedText>
              </>
            ) : (
              <ThemedText type="caption">
                Includes {formatCentavos(charge.processingFeeAmount)} QR Ph fee · waived if paid with credits
              </ThemedText>
            )}
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
        onPress={confirmAndBook}
        disabled={!selectedSlot || submitting}
        loading={submitting}
      />
    </View>
  );

  /**
   * Same pattern as Block's confirm-before-write step: an interstitial
   * before an irreversible action, Cancel/Confirm, nothing runs until
   * the second tap. Gated on the SAME condition the inline disclosure
   * card above already reads — preview.creditApplied, not a second
   * derivation of it — so a cash-only booking sees no new friction at
   * all, and this can never disagree with what the card on screen just
   * told the player.
   *
   * Restates the card's numbers rather than repeating its exact
   * sentence, so this reads as a confirmation of what was already
   * disclosed, not a duplicate of it.
   */
  function confirmAndBook() {
    if (preview.creditApplied <= 0) {
      book();
      return;
    }
    Alert.alert(
      "This booking can't be cancelled",
      `${formatCentavos(preview.creditApplied)} of your Credits will be applied, and you'll pay ${formatCentavos(charge.totalChargedAmount)} now. Once confirmed, this booking can't be cancelled or rescheduled.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm & Pay', style: 'destructive', onPress: book },
      ]
    );
  }
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
