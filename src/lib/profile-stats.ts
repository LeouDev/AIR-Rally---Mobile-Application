import { supabase } from '@/lib/supabase';

export type ProfileStats = {
  /** Confirmed bookings only — the same status getReviewEligibility()
   * requires, so this number and "can I review" always agree. */
  tripCount: number;
  reviewCount: number;
};

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const [tripsResult, reviewsResult] = await Promise.all([
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'confirmed'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  if (tripsResult.error) throw tripsResult.error;
  if (reviewsResult.error) throw reviewsResult.error;
  return { tripCount: tripsResult.count ?? 0, reviewCount: reviewsResult.count ?? 0 };
}
