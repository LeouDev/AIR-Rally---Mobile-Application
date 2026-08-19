import { groupSlots } from '@/lib/slot-groups';

const slot = (iso: string) => ({ slot_start: iso, slot_end: iso });

describe('groupSlots', () => {
  /**
   * The regression this file exists for. The availability RPC returns UTC,
   * so 6 AM in Manila is "2026-08-20T22:00:00Z" on the PREVIOUS day. An
   * earlier version read the hour straight out of the string and filed
   * that under "Evening".
   */
  it('buckets by the venue timezone, not the raw UTC hour', () => {
    const groups = groupSlots([slot('2026-08-19T22:00:00Z')], 'Asia/Manila');

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Morning');
  });

  it('splits a full day across morning, afternoon and evening', () => {
    const groups = groupSlots(
      [
        slot('2026-08-19T23:00:00Z'), // 07:00 Manila
        slot('2026-08-20T05:00:00Z'), // 13:00 Manila
        slot('2026-08-20T11:00:00Z'), // 19:00 Manila
      ],
      'Asia/Manila'
    );

    expect(groups.map((g) => g.label)).toEqual(['Morning', 'Afternoon', 'Evening']);
    expect(groups.every((g) => g.slots.length === 1)).toBe(true);
  });

  it('omits empty groups rather than rendering empty headings', () => {
    const groups = groupSlots([slot('2026-08-20T05:00:00Z')], 'Asia/Manila');

    expect(groups.map((g) => g.label)).toEqual(['Afternoon']);
  });

  it('treats noon as afternoon and 5 PM as evening', () => {
    const boundaries = groupSlots(
      [
        slot('2026-08-20T04:00:00Z'), // 12:00 Manila
        slot('2026-08-20T09:00:00Z'), // 17:00 Manila
      ],
      'Asia/Manila'
    );

    expect(boundaries.map((g) => g.label)).toEqual(['Afternoon', 'Evening']);
  });

  it('handles midnight without spilling into a fourth bucket', () => {
    // Some locales format midnight as "24"; the modulo keeps it at 0.
    const groups = groupSlots([slot('2026-08-19T16:00:00Z')], 'Asia/Manila');

    expect(groups[0].label).toBe('Morning');
  });

  it('groups the same instant differently for venues in different zones', () => {
    const instant = [slot('2026-08-20T02:00:00Z')];

    expect(groupSlots(instant, 'Asia/Manila')[0].label).toBe('Morning'); // 10:00
    expect(groupSlots(instant, 'America/New_York')[0].label).toBe('Evening'); // 22:00
  });

  it('returns nothing for a day with no slots', () => {
    expect(groupSlots([], 'Asia/Manila')).toEqual([]);
  });
});
