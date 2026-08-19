import type { PublicProfile, Review } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type ReviewWithAuthor = Review & { author: PublicProfile | null };

/** Joins author names via public_profiles, not a profiles embed — profiles'
 * own RLS is own-row-only, so an embed would null out every author who
 * isn't the viewer. Same pattern the web app uses. */
export async function listReviewsByVenue(venueId: string): Promise<ReviewWithAuthor[]> {
  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('venue_id', venueId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!reviews || reviews.length === 0) return [];

  const authorIds = Array.from(new Set(reviews.map((r) => r.user_id)));
  const { data: authors, error: authorsError } = await supabase
    .from('public_profiles')
    .select('*')
    .in('id', authorIds);
  if (authorsError) throw authorsError;

  const authorsById = new Map((authors ?? []).map((a) => [a.id, a]));
  return reviews.map((review) => ({ ...review, author: authorsById.get(review.user_id) ?? null }));
}

/**
 * Eligible to review = the caller has at least one CONFIRMED booking at a
 * court belonging to this venue whose end_time has already passed. Two
 * separate queries (courts, then bookings) rather than an embed — same
 * reasoning as the web app: an embed would apply courts' own RLS to the
 * join and could silently drop a still-valid past booking at a
 * since-deactivated court.
 */
export async function getReviewEligibility(
  userId: string,
  venueId: string
): Promise<{ eligible: boolean; bookingId: string | null }> {
  const { data: courts, error: courtsError } = await supabase
    .from('courts')
    .select('id')
    .eq('venue_id', venueId);
  if (courtsError) throw courtsError;
  if (!courts || courts.length === 0) return { eligible: false, bookingId: null };

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .in(
      'court_id',
      courts.map((c) => c.id)
    )
    .lt('end_time', new Date().toISOString())
    .order('end_time', { ascending: false })
    .limit(1);
  if (bookingsError) throw bookingsError;

  const booking = bookings?.[0];
  return booking ? { eligible: true, bookingId: booking.id } : { eligible: false, bookingId: null };
}

export type CreateReviewInput = {
  venueId: string;
  bookingId: string;
  rating: number;
  title?: string;
  comment?: string;
};

/** RLS is the real gate (the insert policy re-checks eligibility
 * server-side), but re-verifying here first gives an honest error message
 * instead of a bare Postgres policy rejection. */
export async function createReview(userId: string, input: CreateReviewInput): Promise<Review> {
  const eligibility = await getReviewEligibility(userId, input.venueId);
  if (!eligibility.eligible || eligibility.bookingId !== input.bookingId) {
    throw new Error("You can review a venue after you've played a confirmed booking there.");
  }

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      venue_id: input.venueId,
      user_id: userId,
      booking_id: input.bookingId,
      rating: input.rating,
      title: input.title?.trim() || null,
      comment: input.comment?.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
