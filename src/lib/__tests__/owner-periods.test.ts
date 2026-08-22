import {
  dayRange,
  isWithin,
  localDateIn,
  monthRange,
  openHoursInRange,
  periodsFor,
  shiftDate,
  weekRange,
  weekdayOf,
} from '@/lib/owner';

/**
 * Business-period boundaries for the owner dashboard.
 *
 * The bug these guard: revenue periods were sliced on UTC midnight while
 * every other date surface in the app works in the venue's own timezone.
 * For a Manila venue (UTC+8) that put every booking starting before
 * 8:00 AM local into the PREVIOUS day's revenue — and, at the turn of a
 * month, into the previous month's.
 *
 * Nothing here hardcodes UTC+8. `venues.timezone` is a per-row column,
 * so the same booking instant has to land in a different business day
 * depending on which venue it belongs to; the Manila and Los Angeles
 * cases below are the same instant read from opposite sides of UTC.
 */

describe('localDateIn — the venue-local business day', () => {
  it('reads an instant as the venue calendar reads it', () => {
    // 2026-08-23T20:00Z is already the 24th in Manila (UTC+8) and still
    // the 23rd in Los Angeles (UTC-7).
    const instant = new Date('2026-08-23T20:00:00.000Z');
    expect(localDateIn(instant, 'Asia/Manila')).toBe('2026-08-24');
    expect(localDateIn(instant, 'America/Los_Angeles')).toBe('2026-08-23');
    expect(localDateIn(instant, 'UTC')).toBe('2026-08-23');
  });

  it('puts an early-morning Manila booking on the Manila day, not the UTC one', () => {
    // 7:00 AM Manila on the 23rd is 23:00Z on the 22nd — the exact case
    // the UTC bounds got wrong.
    const instant = new Date('2026-08-22T23:00:00.000Z');
    expect(localDateIn(instant, 'Asia/Manila')).toBe('2026-08-23');
    expect(localDateIn(instant, 'UTC')).toBe('2026-08-22');
  });

  it('handles a venue in a half-hour offset zone', () => {
    // 2026-08-23T19:00Z is 00:30 on the 24th in Kathmandu (UTC+5:45).
    expect(localDateIn(new Date('2026-08-23T19:00:00.000Z'), 'Asia/Kathmandu')).toBe('2026-08-24');
  });
});

describe('shiftDate — calendar arithmetic', () => {
  it('crosses month ends', () => {
    expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01');
    expect(shiftDate('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('crosses year ends', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles a leap day', () => {
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDate('2028-02-29', 1)).toBe('2028-03-01');
    expect(shiftDate('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('does not drift across a DST transition in a zone that observes one', () => {
    // Date-only values carry no zone, so this is pure calendar math —
    // the point is that it stays pure even for dates where a naive
    // local-time implementation would lose or gain an hour and roll a day.
    expect(shiftDate('2026-03-08', 1)).toBe('2026-03-09'); // US spring forward
    expect(shiftDate('2026-11-01', 1)).toBe('2026-11-02'); // US fall back
  });
});

describe('weekdayOf', () => {
  it('returns 0 for Sunday, matching Postgres day_of_week', () => {
    expect(weekdayOf('2026-08-23')).toBe(0); // Sunday
    expect(weekdayOf('2026-08-24')).toBe(1); // Monday
    expect(weekdayOf('2026-08-29')).toBe(6); // Saturday
  });
});

describe('period ranges', () => {
  it('makes today a single inclusive day', () => {
    expect(dayRange('2026-08-23', 0)).toEqual({ from: '2026-08-23', to: '2026-08-23' });
    expect(dayRange('2026-08-23', 1)).toEqual({ from: '2026-08-22', to: '2026-08-22' });
  });

  it('rolls the previous day back over a month boundary', () => {
    expect(dayRange('2026-09-01', 1)).toEqual({ from: '2026-08-31', to: '2026-08-31' });
  });

  it('runs weeks Sunday to Saturday', () => {
    // 2026-08-26 is a Wednesday.
    expect(weekRange('2026-08-26', 0)).toEqual({ from: '2026-08-23', to: '2026-08-29' });
    expect(weekRange('2026-08-26', 1)).toEqual({ from: '2026-08-16', to: '2026-08-22' });
  });

  it('treats Sunday itself as the first day of its own week', () => {
    expect(weekRange('2026-08-23', 0)).toEqual({ from: '2026-08-23', to: '2026-08-29' });
  });

  it('covers whole calendar months of the right length', () => {
    expect(monthRange('2026-08-23', 0)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(monthRange('2026-08-23', 1)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    // 30-day month, and a February on both a leap and a common year.
    expect(monthRange('2026-09-15', 0)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthRange('2027-02-10', 0)).toEqual({ from: '2027-02-01', to: '2027-02-28' });
    expect(monthRange('2028-02-10', 0)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('rolls the previous month back over a year boundary', () => {
    expect(monthRange('2027-01-15', 1)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('isWithin', () => {
  const august = { from: '2026-08-01', to: '2026-08-31' };

  it('includes both ends', () => {
    expect(isWithin('2026-08-01', august)).toBe(true);
    expect(isWithin('2026-08-31', august)).toBe(true);
  });

  it('excludes the days either side', () => {
    expect(isWithin('2026-07-31', august)).toBe(false);
    expect(isWithin('2026-09-01', august)).toBe(false);
  });
});

describe('bucketing a booking into its venue business day', () => {
  /** What getOwnerAnalytics does per booking, in miniature. */
  function bucket(startIso: string, timezone: string, now: Date) {
    const periods = periodsFor(localDateIn(now, timezone));
    const localDate = localDateIn(new Date(startIso), timezone);
    return {
      localDate,
      isToday: isWithin(localDate, periods.today),
      isYesterday: isWithin(localDate, periods.previousDay),
      isThisMonth: isWithin(localDate, periods.thisMonth),
      isPreviousMonth: isWithin(localDate, periods.previousMonth),
    };
  }

  it('counts a 7 AM Manila booking as TODAY, not yesterday', () => {
    // The regression itself. Now is 10 AM Manila on the 23rd; the
    // booking started at 7 AM Manila the same morning — but both
    // instants are still the 22nd in UTC, which is why the old UTC
    // bounds filed this under yesterday.
    const now = new Date('2026-08-23T02:00:00.000Z'); // 10:00 Manila, 23rd
    const booking = '2026-08-22T23:00:00.000Z'; // 07:00 Manila, 23rd

    const result = bucket(booking, 'Asia/Manila', now);
    expect(result.localDate).toBe('2026-08-23');
    expect(result.isToday).toBe(true);
    expect(result.isYesterday).toBe(false);
  });

  it('still counts a genuinely-yesterday Manila booking as yesterday', () => {
    const now = new Date('2026-08-23T02:00:00.000Z'); // 10:00 Manila, 23rd
    const booking = '2026-08-21T23:00:00.000Z'; // 07:00 Manila, 22nd

    const result = bucket(booking, 'Asia/Manila', now);
    expect(result.localDate).toBe('2026-08-22');
    expect(result.isToday).toBe(false);
    expect(result.isYesterday).toBe(true);
  });

  it('keeps a first-of-the-month Manila morning booking in the new month', () => {
    // 7 AM Manila on 1 Sep is 23:00Z on 31 Aug — under UTC bounds this
    // booking landed in AUGUST's revenue and the month-over-month
    // comparison inherited the error.
    const now = new Date('2026-09-01T02:00:00.000Z'); // 10:00 Manila, 1 Sep
    const booking = '2026-08-31T23:00:00.000Z'; // 07:00 Manila, 1 Sep

    const result = bucket(booking, 'Asia/Manila', now);
    expect(result.localDate).toBe('2026-09-01');
    expect(result.isThisMonth).toBe(true);
    expect(result.isPreviousMonth).toBe(false);
  });

  it('reads the same instant differently for venues on opposite sides of UTC', () => {
    // One instant, two venues. Manila has rolled into the 24th; Los
    // Angeles is still on the 23rd. Both are correct for their own venue.
    const now = new Date('2026-08-23T20:00:00.000Z');
    const booking = '2026-08-23T20:00:00.000Z';

    expect(bucket(booking, 'Asia/Manila', now).localDate).toBe('2026-08-24');
    expect(bucket(booking, 'America/Los_Angeles', now).localDate).toBe('2026-08-23');
    // Each is "today" from its own venue's point of view.
    expect(bucket(booking, 'Asia/Manila', now).isToday).toBe(true);
    expect(bucket(booking, 'America/Los_Angeles', now).isToday).toBe(true);
  });

  it('counts a late-evening Los Angeles booking as today, not tomorrow', () => {
    // 23:00 LA on the 23rd is already 06:00Z on the 24th.
    const now = new Date('2026-08-24T05:00:00.000Z'); // 22:00 LA, 23rd
    const booking = '2026-08-24T06:00:00.000Z'; // 23:00 LA, 23rd

    const result = bucket(booking, 'America/Los_Angeles', now);
    expect(result.localDate).toBe('2026-08-23');
    expect(result.isToday).toBe(true);
  });
});

describe('openHoursInRange', () => {
  const hours = [
    // Venue A: 9 AM – 5 PM every day of the week (8 hours daily).
    ...[0, 1, 2, 3, 4, 5, 6].map((day) => ({
      venue_id: 'venue-a',
      day_of_week: day,
      start_time: '09:00:00',
      end_time: '17:00:00',
    })),
    // Venue B: Saturdays only, 8 AM – 12 PM.
    { venue_id: 'venue-b', day_of_week: 6, start_time: '08:00:00', end_time: '12:00:00' },
  ];

  it('counts both ends of the range', () => {
    // 23rd through 25th inclusive = 3 days × 8 hours.
    expect(openHoursInRange(hours, 'venue-a', { from: '2026-08-23', to: '2026-08-25' })).toBe(24);
  });

  it('counts a single-day range as one day', () => {
    expect(openHoursInRange(hours, 'venue-a', { from: '2026-08-23', to: '2026-08-23' })).toBe(8);
  });

  it('only counts the weekdays a venue actually opens', () => {
    // 2026-08-23 (Sun) through 2026-08-29 (Sat) contains one Saturday.
    expect(openHoursInRange(hours, 'venue-b', { from: '2026-08-23', to: '2026-08-29' })).toBe(4);
  });

  it('walks correctly across a month boundary', () => {
    // 30 Aug through 2 Sep inclusive = 4 days × 8 hours.
    expect(openHoursInRange(hours, 'venue-a', { from: '2026-08-30', to: '2026-09-02' })).toBe(32);
  });

  it('returns zero for a venue with no operating hours configured', () => {
    expect(openHoursInRange(hours, 'venue-unknown', { from: '2026-08-23', to: '2026-08-25' })).toBe(0);
  });
});
