import type { AvailableSlot } from '@/lib/database.types';

export type SlotGroup = { label: string; slots: AvailableSlot[] };

/**
 * Morning / Afternoon / Evening by the slot's hour IN THE VENUE'S
 * TIMEZONE.
 *
 * The availability RPC returns UTC timestamps, so reading the hour out
 * of the raw string is meaningless for grouping — 6 AM in Manila arrives
 * as `T22:00:00Z` the previous day, which lands a morning slot under
 * "Evening". That was a real bug; the Intl formatter below is what fixes
 * it, and slot-groups.test.ts guards it.
 */
export function groupSlots(slots: AvailableSlot[], timeZone: string): SlotGroup[] {
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
    // `% 24` because some locales format midnight as "24".
    const hour = Number(hourFormat.format(new Date(slot.slot_start))) % 24;
    const bucket = hour < 12 ? 0 : hour < 17 ? 1 : 2;
    groups[bucket].slots.push(slot);
  }
  return groups.filter((g) => g.slots.length > 0);
}
