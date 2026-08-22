import { getOwnerAnalytics } from '@/lib/owner';

/**
 * The DB fetch window must cover the venue-local periods it buckets into.
 *
 * Originally filed by QA as BUG-2 with `it.failing`; that file was lost
 * from the shared working tree before it could be committed, so this is
 * a reconstruction — kept because the fix must not close without a gate.
 * Verified to FAIL against the pre-fix derivation and pass against the
 * current one, which `it.failing` on its own never demonstrated.
 *
 * The defect: `5ec78d1` moved the PERIODS to venue-local dates but left
 * the fetch window derived from UTC's calendar month with one day of
 * slack. Slack is the right tool for placing a single INSTANT on a date
 * (max real offset ±14h). It does nothing when the venue's whole current
 * MONTH is a different month from UTC's — then the window is short by up
 * to a month and rows the period logic would have counted are never
 * fetched.
 *
 * Both directions are covered. East of UTC (Manila, the primary market)
 * it is 00:00–08:00 local on the 1st, where "this month" collapses to a
 * single day. West of UTC (Los Angeles) it is the last hours of the
 * month, where the month-over-month baseline is the half that is lost.
 *
 * These assert on the OUTPUT NUMBER, never on the query, so any correct
 * fix satisfies them. The Supabase fake applies `.gte`/`.lte` to
 * `start_time` exactly as Postgres would — if it ignored the filter, the
 * defect could not appear at all.
 */

const OWNER_ID = 'oooooooo-oooo-oooo-oooo-oooooooooooo';
const VENUE_ID = 'vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv';
const COURT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockDb: {
  venues: Record<string, unknown>[];
  courts: Record<string, unknown>[];
  bookings: Record<string, unknown>[];
  window: { from: string | null; to: string | null } | null;
} = { venues: [], courts: [], bookings: [], window: null };

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'OWNER' } }, error: null }) },
    from: (table: string) => {
      let gte: string | null = null;
      let lte: string | null = null;
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        gte: (_c: string, v: string) => {
          gte = v;
          return builder;
        },
        lte: (_c: string, v: string) => {
          lte = v;
          return builder;
        },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          let data: Record<string, unknown>[] = [];
          if (table === 'venues') data = mockDb.venues;
          else if (table === 'courts') data = mockDb.courts;
          else if (table === 'bookings') {
            mockDb.window = { from: gte, to: lte };
            // The real filter, applied the way the database applies it.
            data = mockDb.bookings.filter((b) => {
              const start = b.start_time as string;
              return (!gte || start >= gte) && (!lte || start <= lte);
            });
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  },
}));

function seedMany(timezone: string, bookings: { start: string; status?: string; user?: string }[]) {
  mockDb.venues = [
    {
      id: VENUE_ID,
      owner_id: OWNER_ID,
      name: 'BGC Smash Pickleball',
      city: 'Taguig',
      status: 'active',
      timezone,
      created_at: '2026-01-01T00:00:00Z',
    },
  ];
  mockDb.courts = [{ id: COURT_ID, name: 'Rooftop Court', venue_id: VENUE_ID }];
  mockDb.bookings = bookings.map((b) => ({
    court_id: COURT_ID,
    user_id: b.user ?? 'uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu',
    price_amount: 100_000,
    currency: 'PHP',
    status: b.status ?? 'confirmed',
    start_time: b.start,
    end_time: new Date(new Date(b.start).getTime() + 3_600_000).toISOString(),
  }));
  mockDb.window = null;
}

function seed(timezone: string, startIso: string) {
  mockDb.venues = [
    {
      id: VENUE_ID,
      owner_id: OWNER_ID,
      name: 'BGC Smash Pickleball',
      city: 'Taguig',
      status: 'active',
      timezone,
      created_at: '2026-01-01T00:00:00Z',
    },
  ];
  mockDb.courts = [{ id: COURT_ID, name: 'Rooftop Court', venue_id: VENUE_ID }];
  mockDb.bookings = [
    {
      court_id: COURT_ID,
      user_id: 'uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu',
      price_amount: 100_000,
      currency: 'PHP',
      status: 'confirmed',
      start_time: startIso,
      end_time: new Date(new Date(startIso).getTime() + 3_600_000).toISOString(),
    },
  ];
  mockDb.window = null;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('fetch window vs venue-local periods', () => {
  it('Manila, midnight on the 1st: a September booking counts toward September', async () => {
    // 2026-08-31T16:00Z is midnight on 1 September in Manila. The venue's
    // "this month" is September; UTC's is still August.
    jest.setSystemTime(new Date('2026-08-31T16:00:00.000Z'));
    seed('Asia/Manila', '2026-09-15T02:00:00.000Z'); // 15 Sep, 10:00 Manila

    const analytics = await getOwnerAnalytics(OWNER_ID);
    expect(analytics.revenue.thisMonth.amount).toBe(100_000);
  });

  it('Los Angeles, last hours of the month: the previous month is still the baseline', async () => {
    // 2026-09-01T03:00Z is 20:00 on 31 August in Los Angeles. The venue's
    // "this month" is August and its comparison month July; UTC has
    // already rolled into September.
    jest.setSystemTime(new Date('2026-09-01T03:00:00.000Z'));
    seed('America/Los_Angeles', '2026-07-15T17:00:00.000Z'); // 15 Jul, 10:00 LA

    const analytics = await getOwnerAnalytics(OWNER_ID);
    expect(analytics.revenue.thisMonth.previousAmount).toBe(100_000);
  });

  it('covers the full venue-local month, not UTC’s', async () => {
    jest.setSystemTime(new Date('2026-08-31T16:00:00.000Z')); // 1 Sep, 00:00 Manila
    seed('Asia/Manila', '2026-09-15T02:00:00.000Z');

    await getOwnerAnalytics(OWNER_ID);
    // Manila's September ends on the 30th; the window must reach past it.
    expect(mockDb.window?.to?.slice(0, 10) ?? '').toEqual(expect.any(String));
    expect((mockDb.window?.to ?? '').slice(0, 10) >= '2026-09-30').toBe(true);
  });
});

describe('control: cases that were already correct must stay correct', () => {
  it('counts a mid-month Manila booking toward this month', async () => {
    jest.setSystemTime(new Date('2026-08-15T02:00:00.000Z'));
    seed('Asia/Manila', '2026-08-10T02:00:00.000Z');

    const analytics = await getOwnerAnalytics(OWNER_ID);
    expect(analytics.revenue.thisMonth.amount).toBe(100_000);
  });

  it('still buckets an early-morning Manila booking into today, not yesterday', async () => {
    // The original defect 5ec78d1 fixed — guarded so a fetch-window
    // change cannot regress it.
    jest.setSystemTime(new Date('2026-08-23T02:00:00.000Z')); // 10:00, 23 Aug Manila
    seed('Asia/Manila', '2026-08-22T23:00:00.000Z'); // 07:00, 23 Aug Manila

    const analytics = await getOwnerAnalytics(OWNER_ID);
    expect(analytics.revenue.today.amount).toBe(100_000);
  });
});


/**
 * The window feeds far more than the revenue row. `monthBookings` is the
 * source for occupancy AND bookingInsights, so a short window
 * under-reports peak hour, most-booked courts, per-court occupancy,
 * total bookings, repeat customers and cancellation rate at the same
 * time — every number on the page, not one of them.
 */
describe('everything else the window feeds', () => {
  it('this week is truncated by the same boundary, and must not be', () => {
    // Deliberately its own case: thisWeek has its own range and could be
    // fixed for months while still short for weeks.
    return (async () => {
      // 2026-08-31T16:00Z = Tue 1 Sep 00:00 Manila. Manila's week runs
      // Sun 30 Aug – Sat 5 Sep; UTC still calls it August.
      jest.setSystemTime(new Date('2026-08-31T16:00:00.000Z'));
      seedMany('Asia/Manila', [{ start: '2026-09-04T02:00:00.000Z' }]); // Fri 4 Sep, 10:00 Manila

      const analytics = await getOwnerAnalytics(OWNER_ID);
      expect(analytics.revenue.thisWeek.amount).toBe(100_000);
    })();
  });

  it('occupancy and booking insights see the whole venue-local month', async () => {
    jest.setSystemTime(new Date('2026-08-31T16:00:00.000Z')); // 1 Sep, 00:00 Manila
    seedMany('Asia/Manila', [
      { start: '2026-09-10T02:00:00.000Z', user: 'user-1' }, // 10:00 Manila
      { start: '2026-09-11T02:00:00.000Z', user: 'user-1' }, // repeat customer
      { start: '2026-09-12T06:00:00.000Z', user: 'user-2', status: 'cancelled' },
    ]);

    const analytics = await getOwnerAnalytics(OWNER_ID);

    expect(analytics.bookingInsights.totalBookings).toBe(3);
    expect(analytics.bookingInsights.repeatCustomers).toBe(1);
    expect(analytics.bookingInsights.cancellationRate).toBeCloseTo(1 / 3);
    // Peak hour is 10:00 Manila, from the two non-cancelled bookings.
    expect(analytics.occupancy.peakHour).toBe(10);
    expect(analytics.occupancy.mostBookedCourts[0]?.bookingCount).toBe(2);
    expect(analytics.occupancy.perCourt[0]?.bookedHours).toBe(2);
  });

  it('New York, late on the last of the month: the previous month is a full month', async () => {
    // 2026-09-01T02:00Z = 31 Aug 22:00 New York. Venue's previous month
    // is the whole of July; the old window started 31 July.
    jest.setSystemTime(new Date('2026-09-01T02:00:00.000Z'));
    seedMany('America/New_York', [{ start: '2026-07-05T14:00:00.000Z' }]); // 5 Jul, 10:00 NY

    const analytics = await getOwnerAnalytics(OWNER_ID);
    expect(analytics.revenue.thisMonth.previousAmount).toBe(100_000);
  });
});
