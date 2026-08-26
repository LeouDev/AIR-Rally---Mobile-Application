import { supabase } from '@/lib/supabase';

const UNIQUE_VIOLATION = '23505';

export class DuplicateVenueRequestError extends Error {
  constructor() {
    super("You've already asked for this venue.");
    this.name = 'DuplicateVenueRequestError';
  }
}

export type VenueRequestSuggestion = { placeName: string; placeCity: string };

export type MyVenueRequestDemand = { requesters: number; showCount: boolean };

/**
 * Free-text-only suggestions (migration 20260810000106) — deliberately never
 * surfaces a draft/pending_review venue's name; see the migration for why.
 * Below two characters there's nothing worth showing, so this returns
 * before ever reaching the network — an empty-input suggestion list isn't a
 * suggestion.
 */
export async function getVenueRequestSuggestions(query: string): Promise<VenueRequestSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { data, error } = await supabase.rpc('venue_request_place_suggestions', { p_query: trimmed });
  if (error) throw error;
  return (data ?? []).map((row) => ({ placeName: row.place_name, placeCity: row.place_city }));
}

export type CreateVenueRequestValues = {
  placeName: string;
  placeCity?: string;
  note?: string;
};

/**
 * Records a player's request. userId comes from the caller's own session,
 * never a parameter passed through from further up — the RLS insert policy
 * enforces the same thing (`user_id = auth.uid()`), but failing at the same
 * point in application code is cheaper to read.
 *
 * The unique partial index (one request per user per place) is what makes
 * "14 players asked" a real count; a second identical submission from the
 * same user is a friendly no-op message here, not a raw constraint error.
 */
export async function createVenueRequest(userId: string, values: CreateVenueRequestValues): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('venue_requests')
    .insert({
      user_id: userId,
      place_name: values.placeName,
      place_city: values.placeCity ?? null,
      note: values.note ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateVenueRequestError();
    throw error;
  }
  return { id: data.id };
}

/**
 * The requester's own feedback after submitting — "you're the Nth to ask",
 * or the promise below the threshold of 5. Refuses for a request the caller
 * does not own (see venue_request_demand_for_me's own SECURITY DEFINER
 * check).
 */
export async function getMyVenueRequestDemand(requestId: string): Promise<MyVenueRequestDemand> {
  const { data, error } = await supabase
    .rpc('venue_request_demand_for_me', { p_request_id: requestId })
    .single();
  if (error) throw error;
  return { requesters: data.requesters, showCount: data.show_count };
}
