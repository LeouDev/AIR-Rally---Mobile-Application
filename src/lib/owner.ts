import type { BookingRefund, BookingStatus, OwnedVenue } from '@/lib/database.types';
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
  priceAmount: number;
  refundedAmount: number;
};

export type OwnerEarnings = {
  /** Sum of price_amount across confirmed bookings — what customers have
   * PAID, never a claim of funds received or paid out (real payouts are
   * manual transfers outside this ledger). */
  grossConfirmed: number;
  refunded: number;
  upcomingCount: number;
  rows: OwnerBookingRow[];
};

/**
 * Mobile mirror of the web's getVenueEarnings() (lib/services/
 * venueEarnings.ts) minus the reschedule flags: two separate queries
 * (courts, then bookings) rather than an embed, so a booking at a
 * since-deactivated court can't be silently dropped by the join's RLS.
 */
export async function getOwnerEarnings(venueId: string): Promise<OwnerEarnings> {
  const { data: courts, error: courtsError } = await supabase
    .from('courts')
    .select('id, name')
    .eq('venue_id', venueId);
  if (courtsError) throw courtsError;
  if (!courts || courts.length === 0) {
    return { grossConfirmed: 0, refunded: 0, upcomingCount: 0, rows: [] };
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

  let grossConfirmed = 0;
  let refunded = 0;
  let upcomingCount = 0;
  const now = Date.now();

  const rows: OwnerBookingRow[] = (bookings ?? []).map((row) => {
    const rawRefunds = (row as { booking_refunds?: unknown }).booking_refunds;
    const refunds = (Array.isArray(rawRefunds) ? rawRefunds : []) as BookingRefund[];
    const refundedAmount = refunds
      .filter((r) => r.status === 'succeeded')
      .reduce((sum, r) => sum + r.amount, 0);

    if (row.status === 'confirmed') {
      grossConfirmed += row.price_amount;
      if (new Date(row.start_time).getTime() > now) upcomingCount += 1;
    }
    refunded += refundedAmount;

    return {
      bookingId: row.id,
      confirmationCode: row.confirmation_code,
      courtName: courtNameById.get(row.court_id) ?? 'Court',
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      priceAmount: row.price_amount,
      refundedAmount,
    };
  });

  return { grossConfirmed, refunded, upcomingCount, rows };
}
