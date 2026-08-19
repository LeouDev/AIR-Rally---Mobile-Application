import {
  formatBookingWindow,
  formatCentavos,
  formatSlotTime,
  localDateInTimeZone,
  upcomingDates,
} from '@/lib/bookings';

describe('formatCentavos', () => {
  it('always shows two decimal places, even on whole-peso amounts', () => {
    // Matches lib/event-split.ts's formatShare(), which always shows two
    // decimals — the audit found the same currency reading two different
    // ways depending on which screen displayed it.
    expect(formatCentavos(70000)).toBe('₱700.00');
  });

  it('keeps centavos when they are not zero', () => {
    // The PayMongo processing fee produces exactly this shape (₱406.09).
    expect(formatCentavos(40609)).toBe('₱406.09');
  });

  it('groups thousands', () => {
    expect(formatCentavos(280000)).toBe('₱2,800.00');
  });

  it('renders zero as ₱0.00, not an empty string', () => {
    expect(formatCentavos(0)).toBe('₱0.00');
  });
});

describe('formatSlotTime', () => {
  it('renders the venue-local time, not the device time', () => {
    // 22:00 UTC is 6 AM the next day in Manila.
    expect(formatSlotTime('2026-08-19T22:00:00Z', 'Asia/Manila')).toBe('6:00 AM');
  });

  it('reads the same instant differently for another timezone', () => {
    expect(formatSlotTime('2026-08-19T22:00:00Z', 'America/New_York')).toBe('6:00 PM');
  });
});

describe('formatBookingWindow', () => {
  it('states the day and the start–end range in venue time', () => {
    const window = formatBookingWindow(
      '2026-08-19T22:00:00Z',
      '2026-08-19T23:00:00Z',
      'Asia/Manila'
    );

    expect(window).toBe('Thu, Aug 20 · 6:00 AM – 7:00 AM');
  });
});

describe('localDateInTimeZone', () => {
  it('returns the venue-local calendar date, which can differ from UTC', () => {
    // Still Aug 19 in UTC, already Aug 20 in Manila.
    expect(localDateInTimeZone(new Date('2026-08-19T22:00:00Z'), 'Asia/Manila')).toBe('2026-08-20');
    expect(localDateInTimeZone(new Date('2026-08-19T22:00:00Z'), 'UTC')).toBe('2026-08-19');
  });
});

describe('upcomingDates', () => {
  it('labels the first two days Today and Tomorrow', () => {
    const dates = upcomingDates('Asia/Manila', 4);

    expect(dates).toHaveLength(4);
    expect(dates[0].label).toBe('Today');
    expect(dates[1].label).toBe('Tomorrow');
  });

  it('gives every day a distinct, ordered calendar date', () => {
    const dates = upcomingDates('Asia/Manila', 14);
    const unique = new Set(dates.map((d) => d.localDate));

    expect(unique.size).toBe(14);
    expect([...dates.map((d) => d.localDate)]).toEqual(
      [...dates.map((d) => d.localDate)].sort()
    );
  });

  it('carries a weekday label for every entry', () => {
    for (const date of upcomingDates('Asia/Manila', 7)) {
      expect(date.weekday).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
    }
  });
});
