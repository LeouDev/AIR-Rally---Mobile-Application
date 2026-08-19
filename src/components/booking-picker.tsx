import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Skeleton } from '@/components/ui/skeleton';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatSlotTime } from '@/lib/bookings';
import type { AvailableSlot } from '@/lib/database.types';
import { groupSlots } from '@/lib/slot-groups';

/**
 * Shared rendering for the court → date → duration → slot picker that
 * appears both on the venue page (booking-panel.tsx) and on the
 * reschedule screen. Selection state and booking/submit logic stay in
 * each caller — these components only render, so the two pickers can't
 * drift in size or styling again.
 */

export function SectionLabel({ text }: { text: string }) {
  return (
    <ThemedText type="caption" themeColor="mutedForeground" style={styles.sectionLabel}>
      {text.toUpperCase()}
    </ThemedText>
  );
}

export type PickerCourt = {
  id: string;
  name: string;
  hourly_price: number;
  surface_type?: string | null;
  indoor_outdoor?: string | null;
  capacity?: number | null;
};

export function CourtStrip({
  courts,
  selectedId,
  onSelect,
}: {
  courts: PickerCourt[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {courts.map((c) => {
        const selected = c.id === selectedId;
        const meta = [c.surface_type, c.indoor_outdoor, c.capacity ? `up to ${c.capacity}` : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(c.id)}
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
              style={{ color: selected ? theme.navyForeground : theme.cardForeground }}>
              ₱{c.hourly_price}/hr
            </ThemedText>
            {meta ? (
              <ThemedText
                type="caption"
                numberOfLines={1}
                style={{ color: selected ? theme.navyForeground : theme.mutedForeground }}>
                {meta}
              </ThemedText>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export type PickerDate = { localDate: string; label: string; weekday: string };

export function DateStrip({
  dates,
  selectedDate,
  onSelect,
}: {
  dates: PickerDate[];
  selectedDate: string | null;
  onSelect: (localDate: string) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {dates.map((d) => {
        const selected = d.localDate === selectedDate;
        const dayNumber = Number(d.localDate.slice(8, 10));
        const isToday = d.label === 'Today';
        return (
          <Pressable
            key={d.localDate}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${d.label}, ${d.weekday}`}
            onPress={() => onSelect(d.localDate)}
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
  );
}

export function DurationSegmented({
  options,
  selected,
  onSelect,
}: {
  options: readonly number[];
  selected: number;
  onSelect: (minutes: number) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.muted, borderColor: theme.input }]}>
      {options.map((m) => {
        const isSelected = m === selected;
        return (
          <Pressable
            key={m}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(m)}
            style={({ pressed }) => [
              styles.segment,
              isSelected && { backgroundColor: theme.navy },
              pressed && { opacity: 0.85 },
            ]}>
            <ThemedText
              type="smallBold"
              style={{ color: isSelected ? theme.navyForeground : theme.mutedForeground }}>
              {m / 60}h
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SlotGrid({
  slots,
  selectedSlot,
  onSelect,
  timezone,
  emptyMessage,
}: {
  slots: AvailableSlot[] | null;
  selectedSlot: AvailableSlot | null;
  onSelect: (slot: AvailableSlot, selected: boolean) => void;
  timezone: string;
  emptyMessage: string;
}) {
  const theme = useTheme();

  if (slots === null) {
    return (
      <View style={styles.slotGrid}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.slotCell}>
            <Skeleton height={44} radius={Radius.lg} />
          </View>
        ))}
      </View>
    );
  }

  if (slots.length === 0) {
    return (
      <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <ThemedText type="small" themeColor="subtle">
          {emptyMessage}
        </ThemedText>
      </View>
    );
  }

  return (
    <Fragment>
      {groupSlots(slots, timezone).map((group) => (
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
                  onPress={() => onSelect(slot, selected)}
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
                    {formatSlotTime(slot.slot_start, timezone)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </Fragment>
  );
}

const styles = StyleSheet.create({
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
    minWidth: 150,
    maxWidth: 230,
    minHeight: 74,
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
});
