import type { PublicProfile } from '@/lib/database.types';
import { RankedError, throwRanked } from '@/lib/ranked';
import { supabase } from '@/lib/supabase';

/** database.types.ts is generated from PRODUCTION's schema, and these
 * RPCs exist on staging only (116 hasn't been applied to production
 * yet — see the module doc). supabase.rpc()'s generic is a closed
 * union of production's function names, so TypeScript rejects a real,
 * live, verified RPC name it simply hasn't been told about yet. One
 * narrow cast here instead of nine at each call site; delete this
 * (and the `as any`s it enables) once types are regenerated after the
 * production migration ships. */
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params?: Record<string, unknown>
) => Promise<{ data: any; error: any }>;

/**
 * Open Match — the "find 2-4 people who all have the app" broadcast
 * flow. Backend: migrations 115 (cities, profiles.city_slug) and 116
 * (open_matches, open_match_join_requests, RPCs), STAGING ONLY as of
 * writing — the founder deliberately held production until this UI
 * exists. Design and every decision: the open-match-design memory.
 * Contract this file builds against: the open-match-api-contract
 * memory, verified directly against the live staging schema (not
 * taken from the memo's shorthand) — every RPC below takes a single
 * `p_`-prefixed parameter, which the memo's own signatures don't show;
 * confirmed via PostgREST's "perhaps you meant" hint on each one.
 *
 * Two systems meet at exactly one call: once exactly 2 or exactly 4
 * join requests are accepted, the relevant RPC calls the EXISTING
 * create_ranked_match() unchanged to produce a real ranked_matches row
 * — nothing in lib/ranked.ts changes because of this file.
 */

export type City = {
  slug: string;
  display_name: string;
  region: string;
  aliases: string[];
  sort_order: number;
};

/**
 * Terminal states: 'converted' | 'expired' | 'cancelled'. 'open' covers
 * 1, 2 or 3 accepted (including the host) — there is no separate
 * "filling" status; read the accepted count via
 * openMatchAcceptedCount() for that. See the api-contract memory for
 * why 'converted' (not a boolean or a reason column) is how "this
 * match is full" gets told apart from a real decline.
 */
export type OpenMatchStatus = 'open' | 'converted' | 'expired' | 'cancelled';

export type OpenMatch = {
  id: string;
  host_id: string;
  target_city: string;
  status: OpenMatchStatus;
  created_at: string;
  /** Set only once status = 'converted' — the real ranked_matches row this became. */
  converted_match_id: string | null;
};

/**
 * 'kicked' is deliberately distinct from 'declined' — a kicked request
 * WAS accepted once, so its history should read differently from one
 * that was simply never accepted. 'withdrawn' is the requester's own
 * action; every other terminal state is someone else acting on them.
 */
export type JoinRequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'kicked';

export type OpenMatchJoinRequest = {
  id: string;
  open_match_id: string;
  user_id: string;
  status: JoinRequestStatus;
  created_at: string;
};

/** "This match is full" reads off the PARENT open_matches.status, never
 * a per-request reason — see the api-contract memory. A request whose
 * parent is already 'converted' when it flips to 'declined' means
 * full; anything else declined by the host is a real decline. Callers
 * needing that distinction should read the parent alongside the
 * request, not infer it from the request alone. */
export function matchStatusLabel(status: OpenMatchStatus): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'converted':
      return 'Full';
    case 'expired':
      return 'Expired';
    case 'cancelled':
      return 'Cancelled';
    default:
      // A status this build doesn't recognize — the same shape c3e772b
      // fixed across the ranked-match switches, written into the first
      // commit here instead of retrofitted later.
      return 'Unavailable';
  }
}

/** The curated Philippine city list — 25 rows, founder-approved. Render
 * display_name, store slug; never let the reverse-geocode or a
 * free-text field write anything else into profiles.city_slug. */
export async function listCities(): Promise<City[]> {
  const { data, error } = await supabase.from('cities').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Where someone PLAYS, not where they are right now — permanent until
 * the player changes it themselves, never inferred fresh from device
 * location (see open-match-design: someone working in Cebu City who
 * plays in Mandaue would get broadcast the wrong city's games on a 3pm
 * GPS reading). citySlug must be a real cities.slug — the FK constraint
 * enforces that server-side regardless, but validate against
 * listCities() before calling this rather than let a typo surface as
 * an opaque constraint-violation error. */
export async function setMyCity(userId: string, citySlug: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ city_slug: citySlug } as never).eq('id', userId);
  if (error) throw error;
}

/** Null means never set — profiles.city_slug is a new nullable column
 * (migration 115), so every existing player starts without one. Not an
 * error state; the picker's own empty selection is the right response. */
export async function getMyCity(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('profiles').select('city_slug').eq('id', userId).maybeSingle();
  if (error) throw error;
  return (data as { city_slug: string | null } | null)?.city_slug ?? null;
}

/** Real accepted count INCLUDING THE HOST — no column carries this, it's
 * computed. Readable by non-participants (SECURITY DEFINER), which is
 * what makes the public browse list able to show "2 accepted" without
 * exposing who. */
export async function openMatchAcceptedCount(openMatchId: string): Promise<number> {
  const { data, error } = await rpc('open_match_accepted_count', { p_open_match_id: openMatchId });
  if (error) throw error;
  return data ?? 0;
}

/** Host creates a broadcast for their own registered city. Returns the
 * new open match's id, mirroring createRankedMatch()'s own convention
 * — not independently confirmed against a real signed-in call from
 * this session; flag if the RPC's actual return shape differs. */
export async function createOpenMatch(citySlug: string): Promise<string> {
  const { data, error } = await rpc('create_open_match', { p_city_slug: citySlug });
  if (error) throwRanked(error);
  return data as string;
}

/** Any signed-in player whose OWN profiles.city_slug matches the open
 * match's target city — checked server-side, not trusted from how they
 * arrived at the screen. Rejects with the founder's exact copy if the
 * hypothetical roster (current accepted + this requester) exceeds the
 * open-match rank-gap cap; ranked_party_spread() already returns 0
 * (never errors) when nobody involved is calibrated yet. */
export async function requestToJoinOpenMatch(openMatchId: string): Promise<void> {
  const { error } = await rpc('request_to_join_open_match', { p_open_match_id: openMatchId });
  if (error) throwRanked(error);
}

/** Host only. At exactly 4 accepted this auto-converts inside the RPC —
 * calls create_ranked_match() unchanged, no separate "start doubles" call exists. */
export async function acceptJoinRequest(requestId: string): Promise<void> {
  const { error } = await rpc('accept_join_request', { p_request_id: requestId });
  if (error) throwRanked(error);
}

/** Host only. */
export async function declineJoinRequest(requestId: string): Promise<void> {
  const { error } = await rpc('decline_join_request', { p_request_id: requestId });
  if (error) throwRanked(error);
}

/** Host only — removes an already-accepted request. Lands as 'kicked',
 * not 'declined', so the requester's own history shows they WERE in. */
export async function kickAcceptedPlayer(requestId: string): Promise<void> {
  const { error } = await rpc('kick_accepted_player', { p_request_id: requestId });
  if (error) throwRanked(error);
}

/** The requester's own row only. */
export async function withdrawJoinRequest(requestId: string): Promise<void> {
  const { error } = await rpc('withdraw_join_request', { p_request_id: requestId });
  if (error) throwRanked(error);
}

/** Host only. */
export async function cancelOpenMatch(openMatchId: string): Promise<void> {
  const { error } = await rpc('cancel_open_match', { p_open_match_id: openMatchId });
  if (error) throwRanked(error);
}

/** Host only, exactly 2 accepted (including the host) — singles doesn't
 * auto-convert the way 4-accepted doubles does, since the host may
 * still want to wait for a doubles partner. At exactly 3, no start is
 * possible at all (enforced inside whatever RPC would finalize it, not
 * a separate status) — the host's only moves are kick one or wait for a 4th. */
export async function startOpenMatchSingles(openMatchId: string): Promise<void> {
  const { error } = await rpc('start_open_match_singles', { p_open_match_id: openMatchId });
  if (error) throwRanked(error);
}

export type OpenMatchListing = OpenMatch & {
  host: PublicProfile | null;
  acceptedCount: number;
};

/** The public "open games near you" list — any authenticated user whose
 * profiles.city_slug equals the target city sees this, while status =
 * 'open'. No dedicated RPC (per the api-contract memo); a plain select
 * plus a per-row accepted-count call, since the count has no column to
 * select directly. Other requesters' identities are never exposed here
 * — only the host (via the profiles join) and a count. */
export async function listOpenMatchesForCity(citySlug: string): Promise<OpenMatchListing[]> {
  const { data, error } = await supabase
    .from('open_matches')
    .select('*, host:profiles!open_matches_host_id_fkey(id, display_name, avatar_url)')
    .eq('target_city', citySlug)
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as (OpenMatch & { host: PublicProfile | null })[];
  const counts = await Promise.all(rows.map((r) => openMatchAcceptedCount(r.id).catch(() => 1)));
  return rows.map((r, i) => ({ ...r, acceptedCount: counts[i] }));
}

export { RankedError };
