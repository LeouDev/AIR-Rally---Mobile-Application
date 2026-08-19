import type { Booking, BookingRefund, BookingStatus, OwnedVenue } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/** The signed-in owner's venues at ANY status — their own RLS, not the
 * active-only marketplace view. */
export async function listMyVenues(): Promise<OwnedVenue[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('venues')
    .select('id, owner_id, name, city, status, timezone, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type OwnerBookingRow = {
  bookingId: string;
  confirmationCode: string;
  courtName: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  paymentProvider: Booking['payment_provider'];
  paidAt: string | null;
  priceAmount: number;
  currency: string;
  platformFeeAmount: number | null;
  venueAmount: number | null;
  refundedAmount: number;
  /** Sum of succeeded refunds' venue_refund_amount — from PayMongo's own
   * real split_refund response only, never computed locally. Null (not
   * zero) whenever no succeeded refund has reported this yet. */
  venueRefundAmount: number | null;
  /** True when this booking was cancelled by a completed reschedule —
   * its slot moved to a replacement booking, never a claim about money
   * already moved. */
  wasRescheduled: boolean;
  /** True when this booking IS a completed reschedule's replacement. */
  isRescheduleReplacement: boolean;
};

export type OwnerEarnings = {
  currency: string;
  /** Sum of price_amount across confirmed bookings — what customers have
   * PAID, never a claim of funds received or paid out (real payouts are
   * manual transfers outside this ledger). */
  grossConfirmed: number;
  refunded: number;
  /** Sum of venue_amount where actually snapshotted (PayMongo
   * marketplace split only) — the requested split, not a confirmation
   * that PayMongo actually settled/paid out that amount. */
  splitVenueAmount: number;
  upcomingCount: number;
  rows: OwnerBookingRow[];
};

/**
 * Mobile mirror of the web's getVenueEarnings() (lib/services/
 * venueEarnings.ts) — same two-separate-queries shape (courts, then
 * bookings) so a booking at a since-deactivated court can't be silently
 * dropped by a join's RLS. This surfaces what customers have paid, and —
 * only when actually snapshotted at checkout (PayMongo marketplace
 * split) — the platform/venue split of that amount. It is NOT a
 * statement that any of it has been paid out/settled to the venue's bank
 * account; the UI consuming this must never describe an amount as
 * "received," "paid out," or "in your account."
 */
export async function getOwnerEarnings(venueId: string): Promise<OwnerEarnings> {
  const { data: courts, error: courtsError } = await supabase.from('courts').select('id, name').eq('venue_id', venueId);
  if (courtsError) throw courtsError;
  if (!courts || courts.length === 0) {
    return { currency: 'PHP', grossConfirmed: 0, refunded: 0, splitVenueAmount: 0, upcomingCount: 0, rows: [] };
  }
  const courtNameById = new Map(courts.map((c) => [c.id, c.name]));

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('*, booking_refunds(*)')
    .in(
      'court_id',
      courts.map((c) => c.id)
    )
    .order('start_time', { ascending: false })
    .limit(100);
  if (bookingsError) throw bookingsError;

  const bookingIds = (bookings ?? []).map((b) => b.id);
  const { data: rescheduleRows, error: reschedulesError } =
    bookingIds.length > 0
      ? await supabase
          .from('booking_reschedules')
          .select('original_booking_id, new_booking_id, status')
          .or(`original_booking_id.in.(${bookingIds.join(',')}),new_booking_id.in.(${bookingIds.join(',')})`)
      : { data: [], error: null };
  if (reschedulesError) throw reschedulesError;
  const rescheduledOriginals = new Set(
    (rescheduleRows ?? []).filter((r) => r.status === 'completed').map((r) => r.original_booking_id)
  );
  const rescheduleReplacements = new Set(
    (rescheduleRows ?? []).filter((r) => r.status === 'completed').map((r) => r.new_booking_id)
  );

  let grossConfirmed = 0;
  let refunded = 0;
  let splitVenueAmount = 0;
  let upcomingCount = 0;
  let currency = 'PHP';
  const now = Date.now();

  const rows: OwnerBookingRow[] = (bookings ?? []).map((row) => {
    const rawRefunds = (row as { booking_refunds?: unknown }).booking_refunds;
    const refunds = (Array.isArray(rawRefunds) ? rawRefunds : []) as BookingRefund[];
    const succeededRefunds = refunds.filter((r) => r.status === 'succeeded');
    const refundedAmount = succeededRefunds.reduce((sum, r) => sum + r.amount, 0);
    const knownVenueRefundLegs = succeededRefunds.filter((r) => r.venue_refund_amount != null);
    const venueRefundAmount =
      knownVenueRefundLegs.length > 0 ? knownVenueRefundLegs.reduce((sum, r) => sum + (r.venue_refund_amount ?? 0), 0) : null;

    currency = row.currency;
    if (row.status === 'confirmed') {
      grossConfirmed += row.price_amount;
      if (new Date(row.start_time).getTime() > now) upcomingCount += 1;
    }
    refunded += refundedAmount;
    if (row.venue_amount != null) splitVenueAmount += row.venue_amount;

    return {
      bookingId: row.id,
      confirmationCode: row.confirmation_code,
      courtName: courtNameById.get(row.court_id) ?? 'Court',
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      paymentProvider: row.payment_provider,
      paidAt: row.paid_at,
      priceAmount: row.price_amount,
      currency: row.currency,
      platformFeeAmount: row.platform_fee_amount,
      venueAmount: row.venue_amount,
      refundedAmount,
      venueRefundAmount,
      wasRescheduled: rescheduledOriginals.has(row.id),
      isRescheduleReplacement: rescheduleReplacements.has(row.id),
    };
  });

  return { currency, grossConfirmed, refunded, splitVenueAmount, upcomingCount, rows };
}

// --- Analytics (Overview dashboard) ---------------------------------------

export type RevenuePeriod = {
  amount: number;
  previousAmount: number;
  /** null when the previous period had zero revenue — a percentage
   * change is undefined, not 0 or infinite. */
  changePct: number | null;
};

export type CourtOccupancy = {
  courtId: string;
  courtName: string;
  bookedHours: number;
  openHours: number;
  /** null when openHours is 0 (no operating hours configured yet). */
  occupancyPct: number | null;
};

export type MostBookedCourt = {
  courtId: string;
  courtName: string;
  bookingCount: number;
};

export type OwnerAnalytics = {
  currency: string;
  revenue: {
    today: RevenuePeriod;
    thisWeek: RevenuePeriod;
    thisMonth: RevenuePeriod;
  };
  occupancy: {
    perCourt: CourtOccupancy[];
    mostBookedCourts: MostBookedCourt[];
    /** Hour of day (0–23, in each booking's own venue timezone) with the
     * most bookings this month. Null if no bookings yet. */
    peakHour: number | null;
    lowestHour: number | null;
  };
  bookingInsights: {
    totalBookings: number;
    repeatCustomers: number;
    cancellationRate: number;
  };
};

type AnalyticsBookingRow = {
  court_id: string;
  user_id: string;
  price_amount: number;
  currency: string;
  status: string;
  start_time: string;
  end_time: string;
};

type OperatingHoursRow = { venue_id: string; day_of_week: number; start_time: string; end_time: string };

function utcDayBounds(daysAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function utcWeekBounds(weeksAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay() - weeksAgo * 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

function utcMonthBounds(monthsAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 1));
  return { start, end };
}

function inRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

function sumConfirmedRevenue(bookings: AnalyticsBookingRow[], start: Date, end: Date): number {
  return bookings.filter((b) => b.status === 'confirmed' && inRange(b.start_time, start, end)).reduce((sum, b) => sum + b.price_amount, 0);
}

function revenuePeriod(
  bookings: AnalyticsBookingRow[],
  current: { start: Date; end: Date },
  previous: { start: Date; end: Date }
): RevenuePeriod {
  const amount = sumConfirmedRevenue(bookings, current.start, current.end);
  const previousAmount = sumConfirmedRevenue(bookings, previous.start, previous.end);
  const changePct = previousAmount === 0 ? null : (amount - previousAmount) / previousAmount;
  return { amount, previousAmount, changePct };
}

function hmsToMinutes(hms: string): number {
  const [h, m] = hms.split(':').map(Number);
  return h * 60 + m;
}

function hoursBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60 * 60);
}

function openHoursInRange(operatingHours: OperatingHoursRow[], venueId: string, from: Date, to: Date): number {
  const rowsForVenue = operatingHours.filter((r) => r.venue_id === venueId);
  if (rowsForVenue.length === 0) return 0;

  let total = 0;
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (cursor.getTime() < to.getTime()) {
    const dow = cursor.getUTCDay();
    for (const row of rowsForVenue) {
      if (row.day_of_week === dow) {
        total += (hmsToMinutes(row.end_time) - hmsToMinutes(row.start_time)) / 60;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}

function localStartHour(startIso: string, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }).format(new Date(startIso));
  return Number(formatted) % 24;
}

/**
 * Mobile mirror of the web's getOwnerAnalytics() (lib/services/
 * ownerAnalytics.ts) — revenue (today/this-week/this-month, each with a
 * same-length prior-period comparison), occupancy (booked ÷ open hours
 * per court, most-booked courts, peak/lowest booking hour), and booking
 * insights (total, repeat customers, cancellation rate), across every
 * court this owner owns (not scoped to one venue, unlike getOwnerEarnings
 * — matches the web dashboard exactly).
 */
export async function getOwnerAnalytics(ownerId: string): Promise<OwnerAnalytics> {
  const empty: OwnerAnalytics = {
    currency: 'PHP',
    revenue: {
      today: { amount: 0, previousAmount: 0, changePct: null },
      thisWeek: { amount: 0, previousAmount: 0, changePct: null },
      thisMonth: { amount: 0, previousAmount: 0, changePct: null },
    },
    occupancy: { perCourt: [], mostBookedCourts: [], peakHour: null, lowestHour: null },
    bookingInsights: { totalBookings: 0, repeatCustomers: 0, cancellationRate: 0 },
  };

  const venues = await listMyVenues();
  if (venues.length === 0) return empty;
  const venuesById = new Map(venues.map((v) => [v.id, v]));

  const { data: courtRows, error: courtsError } = await supabase
    .from('courts')
    .select('id, name, venue_id')
    .in(
      'venue_id',
      venues.map((v) => v.id)
    );
  if (courtsError) throw courtsError;
  const courts = courtRows ?? [];
  if (courts.length === 0) return empty;
  const courtNameById = new Map(courts.map((c) => [c.id, c.name]));
  const courtIds = courts.map((c) => c.id);

  const thisMonth = utcMonthBounds(0);
  const lastMonth = utcMonthBounds(1);

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('court_id, user_id, price_amount, currency, status, start_time, end_time')
    .in('court_id', courtIds)
    .gte('start_time', lastMonth.start.toISOString())
    .lt('start_time', thisMonth.end.toISOString());
  if (bookingsError) throw bookingsError;
  const bookingRows = (bookings ?? []) as AnalyticsBookingRow[];

  const currency = bookingRows.find((b) => b.status === 'confirmed')?.currency ?? 'PHP';

  const revenue = {
    today: revenuePeriod(bookingRows, utcDayBounds(0), utcDayBounds(1)),
    thisWeek: revenuePeriod(bookingRows, utcWeekBounds(0), utcWeekBounds(1)),
    thisMonth: revenuePeriod(bookingRows, thisMonth, lastMonth),
  };

  const monthBookings = bookingRows.filter((b) => inRange(b.start_time, thisMonth.start, thisMonth.end));
  const activeMonthBookings = monthBookings.filter((b) => b.status !== 'cancelled');

  const { data: operatingHours, error: ohError } = await supabase
    .from('venue_operating_hours')
    .select('venue_id, day_of_week, start_time, end_time')
    .in('venue_id', Array.from(venuesById.keys()));
  if (ohError) throw ohError;
  const operatingHoursRows = (operatingHours ?? []) as OperatingHoursRow[];

  const now = new Date();
  const bookedHoursByCourtId = new Map<string, number>();
  const bookingCountByCourtId = new Map<string, number>();
  for (const b of activeMonthBookings) {
    bookedHoursByCourtId.set(b.court_id, (bookedHoursByCourtId.get(b.court_id) ?? 0) + hoursBetween(b.start_time, b.end_time));
    bookingCountByCourtId.set(b.court_id, (bookingCountByCourtId.get(b.court_id) ?? 0) + 1);
  }

  const perCourt: CourtOccupancy[] = courts.map((court) => {
    const venue = venuesById.get(court.venue_id);
    const openHours = venue ? openHoursInRange(operatingHoursRows, venue.id, thisMonth.start, now) : 0;
    const bookedHours = bookedHoursByCourtId.get(court.id) ?? 0;
    return {
      courtId: court.id,
      courtName: court.name,
      bookedHours,
      openHours,
      occupancyPct: openHours === 0 ? null : bookedHours / openHours,
    };
  });

  const mostBookedCourts: MostBookedCourt[] = Array.from(bookingCountByCourtId.entries())
    .map(([courtId, bookingCount]) => ({ courtId, courtName: courtNameById.get(courtId) ?? 'Court', bookingCount }))
    .sort((a, b) => b.bookingCount - a.bookingCount)
    .slice(0, 5);

  const hourCounts = new Map<number, number>();
  for (const b of activeMonthBookings) {
    const venue = venuesById.get(courts.find((c) => c.id === b.court_id)?.venue_id ?? '');
    const hour = localStartHour(b.start_time, venue?.timezone ?? 'Asia/Manila');
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }
  let peakHour: number | null = null;
  let lowestHour: number | null = null;
  let maxCount = -Infinity;
  let minCount = Infinity;
  for (const [hour, count] of hourCounts) {
    if (count > maxCount) {
      maxCount = count;
      peakHour = hour;
    }
    if (count < minCount) {
      minCount = count;
      lowestHour = hour;
    }
  }

  const totalBookings = monthBookings.length;
  const cancelledCount = monthBookings.filter((b) => b.status === 'cancelled').length;
  const countByCustomer = new Map<string, number>();
  for (const b of monthBookings) {
    countByCustomer.set(b.user_id, (countByCustomer.get(b.user_id) ?? 0) + 1);
  }
  const repeatCustomers = Array.from(countByCustomer.values()).filter((count) => count > 1).length;

  return {
    currency,
    revenue,
    occupancy: { perCourt, mostBookedCourts, peakHour, lowestHour },
    bookingInsights: {
      totalBookings,
      repeatCustomers,
      cancellationRate: totalBookings === 0 ? 0 : cancelledCount / totalBookings,
    },
  };
}
