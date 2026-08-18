import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme, type Theme } from '@/hooks/use-theme';
import type { AvailableSlot } from '@/lib/database.types';
import {
  DURATION_OPTIONS_MINUTES,
  formatSlotTime,
  getAvailableSlots,
  upcomingDates,
} from '@/lib/bookings';
import { createCheckoutSession } from '@/lib/checkout';
import type { VenueDetail } from '@/lib/venues';

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

  const pickSlot = (slot: AvailableSlot, selected: boolean) => {
    animateNext();
    setSelectedSlot(selected ? null : slot);
  };

  return (
    <View style={styles.block}>
      <ThemedText type="subtitle">Book a court</ThemedText>

      <SectionLabel text="Court" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}>
        {venue.courts.map((c) => {
          const selected = c.id === courtId;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setCourtId(c.id)}
              style={({ pressed }) => [
                styles.courtCard,
                {
                  backgroundColor: selected ? theme.navy : theme.card,
                  borderColor: selected ? theme.navy : theme.input,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={{ color: selected ? theme.navyForeground : theme.cardForeground }}>
                {c.name}
              </ThemedText>
              <ThemedText
                type="caption"
                style={{ color: selected ? theme.navyForeground : theme.mutedForeground }}>
                ₱{c.hourly_price}/hr
                {c.surface_type ? ` · ${c.surface_type}` : ''}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      <SectionLabel text="Date" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}>
        {dates.map((d) => {
          const selected = d.localDate === localDate;
          const dayNumber = Number(d.localDate.slice(8, 10));
          const isToday = d.label === 'Today';
          return (
            <Pressable
              key={d.localDate}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${d.label}, ${d.weekday}`}
              onPress={() => setLocalDate(d.localDate)}
              style={({ pressed }) => [
                styles.dayCell,
                {
                  backgroundColor: selected ? theme.navy : theme.card,
                  borderColor: selected ? theme.navy : theme.input,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <ThemedText
                type="caption"
                style={{
                  color: selected
                    ? theme.navyForeground
                    : isToday
                      ? theme.primary
                      : theme.mutedForeground,
                }}>
                {isToday ? 'Today' : d.weekday}
              </ThemedText>
              <ThemedText
                type="subtitle"
                style={{ color: selected ? theme.navyForeground : theme.cardForeground }}>
                {dayNumber}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      <SectionLabel text="Session length" />
      <View style={[styles.segmented, { backgroundColor: theme.muted, borderColor: theme.input }]}>
        {DURATION_OPTIONS_MINUTES.map((m) => {
          const selected = m === duration;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setDuration(m)}
              style={({ pressed }) => [
                styles.segment,
                selected && { backgroundColor: theme.navy },
                pressed && { opacity: 0.85 },
              ]}>
              <ThemedText
                type="smallBold"
                style={{ color: selected ? theme.navyForeground : theme.mutedForeground }}>
                {m / 60}h
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <SectionLabel text="Start time" />
      {slots === null ? (
        <View style={styles.slotGrid}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.slotCell}>
              <Skeleton height={44} radius={Radius.lg} />
            </View>
          ))}
        </View>
      ) : slots.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="subtle">
            {slotsError
              ? "Couldn't load times. Check your connection and reselect a date."
              : 'No open times this day — try another day or a shorter session.'}
          </ThemedText>
        </View>
      ) : (
        groupSlots(slots, venue.timezone).map((group) => (
          <View key={group.label} style={styles.slotGroup}>
            <ThemedText type="caption" themeColor="mutedForeground">
              {group.label}
            </ThemedText>
            <View style={styles.slotGrid}>
              {group.slots.map((slot) => {
                const selected = selectedSlot?.slot_start === slot.slot_start;
                return (
                  <Pressable
                    key={slot.slot_start}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => pickSlot(slot, selected)}
                    style={({ pressed }) => [
                      styles.slotCell,
                      styles.slot,
                      {
                        backgroundColor: selected ? theme.navy : theme.card,
                        borderColor: selected ? theme.navy : theme.input,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <ThemedText
                      type="smallBold"
                      style={{ color: selected ? theme.navyForeground : theme.cardForeground }}>
                      {formatSlotTime(slot.slot_start, venue.timezone)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}

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
              Credits apply automatically · QR Ph payment
            </ThemedText>
          </View>
          <ThemedText type="heading">₱{estimate.toLocaleString('en-PH')}</ThemedText>
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

function SectionLabel({ text }: { text: string }) {
  return (
    <ThemedText type="caption" themeColor="mutedForeground" style={styles.sectionLabel}>
      {text.toUpperCase()}
    </ThemedText>
  );
}

type SlotGroup = { label: string; slots: AvailableSlot[] };

/** Morning / Afternoon / Evening by the slot's hour IN THE VENUE'S
 * TIMEZONE — the RPC returns UTC timestamps, so the raw string's hour
 * field is meaningless for grouping (6 AM Manila arrives as T22 UTC). */
function groupSlots(slots: AvailableSlot[], timeZone: string): SlotGroup[] {
  const hourFormat = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  });
  const groups: SlotGroup[] = [
    { label: 'Morning', slots: [] },
    { label: 'Afternoon', slots: [] },
    { label: 'Evening', slots: [] },
  ];
  for (const slot of slots) {
    const hour = Number(hourFormat.format(new Date(slot.slot_start))) % 24;
    const bucket = hour < 12 ? 0 : hour < 17 ? 1 : 2;
    groups[bucket].slots.push(slot);
  }
  return groups.filter((g) => g.slots.length > 0);
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.two,
  },
  sectionLabel: {
    letterSpacing: 1.2,
    marginTop: Spacing.two,
  },
  strip: {
    gap: Spacing.two,
    paddingRight: Spacing.two,
  },
  courtCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minWidth: 132,
    minHeight: 56,
    justifyContent: 'center',
    gap: 2,
  },
  dayCell: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    width: 58,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: Radius.lg - 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotGroup: {
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  slotCell: {
    flexGrow: 0,
    flexBasis: '31.4%',
  },
  slot: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
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
