import { supabase } from '@/lib/supabase';

export async function listFavoriteVenueIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('favorites').select('venue_id').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.venue_id);
}

/** Idempotent — favoriting something already favorited is a no-op. */
export async function addFavorite(userId: string, venueId: string): Promise<void> {
  const { error } = await supabase.from('favorites').insert({ user_id: userId, venue_id: venueId });
  // 23505 = unique_violation — already favorited, not a real error.
  if (error && error.code !== '23505') throw error;
}

/** Idempotent — removing a favorite that isn't there is a no-op. */
export async function removeFavorite(userId: string, venueId: string): Promise<void> {
  const { error } = await supabase.from('favorites').delete().eq('user_id', userId).eq('venue_id', venueId);
  if (error) throw error;
}

/** Every favorited venue with its live marketplace data, for the Saved
 * Courts screen — a venue that's since gone inactive silently drops out
 * (venue_marketplace only lists active venues), which is correct: a
 * saved court that can no longer be booked shouldn't clutter the list. */
export async function listFavoriteVenues(userId: string) {
  const ids = await listFavoriteVenueIds(userId);
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('venue_marketplace').select('*').in('id', ids);
  if (error) throw error;
  return data ?? [];
}
