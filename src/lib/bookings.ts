import type { AvailableSlot, Booking } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/** Mirrors the web's booking-config constants — whole-hour grid, 30-min
 * lead time. Durations are 1–4 hours per MIN/MAX_DURATION_MINUTES. */
export const SLOT_INCREMENT_MINUTES = 60;
export const MIN_LEAD_TIME_MINUTES = 30;
export const DURATION_OPTIONS_MINUTES = [60, 120, 180, 240];
export const MAX_BOOKING_WINDOW_DAYS = 30;

/** PayMongo's QR Ph rate — the only method this app enables. Mirrors the
 * web's booking-config.ts exactly; the two must agree, since this number
 * only predicts what the server (and PayMongo) will actually charge. */
export const PROCESSING_FEE_PERCENT = 0.015;

export type BookingCharge = {
  courtAmount: number;
  processingFeeAmount: number;
  totalChargedAmount: number;
};

/**
 * Port of the web's calculateBookingCharge() (lib/services/bookingFee.ts)
 * — what to show a customer BEFORE checkout as the real total, since
 * price_amount alone under-reports it once the fee is passed on. The fee
 * is GROSSED UP, not added: PayMongo's rate applies to the total charged,
 * not the court price, so a flat percentage of the court price
 * under-collects every time. Integer centavos throughout; the fee is
 * derived as the remainder so courtAmount + processingFeeAmount ===
 * totalChargedAmount exactly, never independently rounded.
 */
export function calculateBookingCharge(courtAmountCentavos: number): BookingCharge {
  if (courtAmountCentavos <= 0) {
    return { courtAmount: 0, processingFeeAmount: 0, totalChargedAmount: 0 };
  }
  const totalChargedAmount = Math.round(courtAmountCentavos / (1 - PROCESSING_FEE_PERCENT));
  const processingFeeAmount = totalChargedAmount - courtAmountCentavos;
  return { courtAmount: courtAmountCentavos, processingFeeAmount, totalChargedAmount };
}

/** Same RPC the web books through — computed inside Postgres with the
 * exact overlap semantics of the double-booking constraint, so a slot
 * returned here is provably insertable. `localDate` is "YYYY-MM-DD" in
 * the VENUE's timezone, interpreted server-side. */
export async function getAvailableSlots(
  courtId: string,
  localDate: string,
  durationMinutes: number
): Promise<AvailableSlot[]> {
  const { data, error } = await supabase.rpc('get_available_slots', {
    p_court_id: courtId,
    p_local_date: localDate,
    p_duration_minutes: durationMinutes,
    p_increment_minutes: SLOT_INCREMENT_MINUTES,
    p_min_lead_minutes: MIN_LEAD_TIME_MINUTES,
  });
  if (error) throw error;
  return data ?? [];
}

export type BookingWithCourt = Booking & {
  courts: { name: string; venues: { name: string; timezone: string } | null } | null;
};

/** PostgREST returns to-one embeds as objects, but the web repo
 * normalizes arrays defensively (see listMyBookingsWithDetails) — do the
 * same, then cast: embeds resolve from real FKs server-side, but the
 * hand-written Database type declares no Relationships metadata. A venue
 * that has gone inactive won't resolve a name through its own RLS — known
 * accepted limitation, the screens fall back to "Venue". */
function normalizeBookingRow(row: Record<string, unknown>): BookingWithCourt {
  const rawCourt = row.courts;
  const court = (Array.isArray(rawCourt) ? rawCourt[0] : rawCourt) as
    | { name: string; venues: unknown }
    | null
    | undefined;
  const rawVenue = court?.venues;
  const venue = (Array.isArray(rawVenue) ? rawVenue[0] : rawVenue) as
    | { name: string; timezone: string }
    | null
    | undefined;
  return {
    ...(row as unknown as Booking),
    courts: court ? { name: court.name, venues: venue ?? null } : null,
  };
}

/** The user's own bookings (RLS-scoped), newest start first, with court
 * and venue names embedded via the real foreign keys. */
export async function listMyBookings(): Promise<BookingWithCourt[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, courts(name, venues(name, timezone))')
    .order('start_time', { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeBookingRow);
}

export async function getBookingWithCourt(bookingId: string): Promise<BookingWithCourt | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, courts(name, venues(name, timezone))')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeBookingRow(data as unknown as Record<string, unknown>) : null;
}

/** "YYYY-MM-DD" for a Date as seen in `timeZone` — never the device's
 * local calendar, which can disagree with the venue's around midnight. */
export function localDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** Next `count` venue-local calendar dates starting today. */
export function upcomingDates(timeZone: string, count: number): { localDate: string; label: string; weekday: string }[] {
  const out: { localDate: string; label: string; weekday: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const localDate = localDateInTimeZone(date, timeZone);
    const label =
      i === 0
        ? 'Today'
        : i === 1
          ? 'Tomorrow'
          : new Intl.DateTimeFormat('en-PH', { timeZone, month: 'short', day: 'numeric' }).format(date);
    const weekday = new Intl.DateTimeFormat('en-PH', { timeZone, weekday: 'short' }).format(date);
    out.push({ localDate, label, weekday });
  }
  return out;
}

/** "9:00 AM" in the venue's timezone from a timestamptz string. */
export function formatSlotTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

/** "Mon, Aug 18 · 9:00 AM – 11:00 AM" in the venue's timezone. */
export function formatBookingWindow(startIso: string, endIso: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-PH', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(startIso));
  return `${day} · ${formatSlotTime(startIso, timeZone)} – ${formatSlotTime(endIso, timeZone)}`;
}

/** Centavos → "₱1,234.50" (drops ".00" for whole-peso amounts). */
export function formatCentavos(amount: number): string {
  const pesos = amount / 100;
  const hasCentavos = amount % 100 !== 0;
  return `₱${pesos.toLocaleString('en-PH', {
    minimumFractionDigits: hasCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
