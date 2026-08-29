import type { PostgrestError } from '@supabase/supabase-js';

import type {
  PlayerMatchTotals,
  PlayerRank,
  PublicProfile,
  RankedLeaderboardRow,
  RankedMatch,
  RankedMatchPlayer,
  RankedMatchPoint,
  RankedMatchStatus,
  RankedMatchType,
  RankedOfficiatingMode,
  RankedPips,
  RankedTeam,
  RankedTier,
} from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/**
 * AIR/Rally Ranked — direct-to-Supabase, same posture as lib/bookings.ts
 * and lib/events.ts. There is no bearer-JWT /api/mobile/* layer here:
 * Ranked never touches money, so every read is a plain `.from(...)` under
 * RLS and every write is one of the RPCs below (all SECURITY DEFINER —
 * the tables themselves have no client insert/update policy, so this
 * file IS the entire write surface, same as the web repo's
 * lib/services/ranked.ts reaches through).
 *
 * Ported from the web repo's lib/services/ranked.ts (reads/writes),
 * lib/ranked.ts (presentation) and the parts of lib/rating.ts a client
 * needs for a party-eligibility preview — kept in one file rather than
 * three, matching this app's one-file-per-domain convention.
 */

/**
 * A ranked rule the player is meant to read verbatim — "Party rank
 * difference too large", "Only the scorekeeper can submit the final
 * score." Every RAISE in 20260810000067_air_rally_ranked.sql carries
 * SQLSTATE AR001 specifically so it can be told apart from a generic
 * constraint failure and shown to the player as-is, the same
 * distinction checkout.ts's callApi() draws for the bearer-API errors.
 */
export class RankedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RankedError';
  }
}

const RANKED_RULE_SQLSTATE = 'AR001';

function throwRanked(error: PostgrestError): never {
  if (error.code === RANKED_RULE_SQLSTATE) throw new RankedError(error.message);
  throw error;
}

/* -------------------------------------------------------------------------
 * Rating math — a preview/mirror layer, not the authority. The real
 * engine is apply_ranked_result() in Postgres; this only derives the
 * tier/star a rating displays as and previews the party-spread rule
 * create_ranked_match() itself enforces, so a screen can grey out a
 * button before a round trip. The database re-checks regardless.
 * ---------------------------------------------------------------------- */

/** Mid-Driver, not the tier floor — matches player_ranks.rating's default (web migration 20260810000112). */
export const RATING_STARTING_VALUE = 1100;

export const RANK_THRESHOLDS = [
  { tier: 1, slug: 'dinker', name: 'Dinker', material: '#c2ad8b', floor: 0, width: 1000 },
  { tier: 2, slug: 'driver', name: 'Driver', material: '#d9903a', floor: 1000, width: 200 },
  { tier: 3, slug: 'volleyer', name: 'Volleyer', material: '#f3700f', floor: 1200, width: 200 },
  { tier: 4, slug: 'smasher', name: 'Smasher', material: '#f3700f', floor: 1400, width: 200 },
  { tier: 5, slug: 'ace', name: 'Ace', material: '#f3700f', floor: 1600, width: 200 },
  { tier: 6, slug: 'kitchen-king', name: 'Kitchen King', material: '#f3700f', floor: 1800, width: 200 },
  { tier: 7, slug: 'champion', name: 'Champion', material: '#f3700f', floor: 2000, width: Infinity },
] as const;

export const RANKED_TIER_COUNT = RANK_THRESHOLDS.length;
export const RANKED_PIPS_PER_TIER = 5;
/** Matches c_calibration_matches in apply_ranked_result(). */
export const RANKED_CALIBRATION_MATCHES = 10;
/** The party-spread cap — a ranked doubles party's members must all sit within this many ARR points of each other. */
export const RANKED_MAX_PARTY_ARR_SPREAD = 250;

export type RankedTierInfo = (typeof RANK_THRESHOLDS)[number];

export function tierInfo(tier: RankedTier): RankedTierInfo {
  const index = Math.min(Math.max(tier, 1), RANKED_TIER_COUNT) - 1;
  return RANK_THRESHOLDS[index];
}

const STARS_PER_RANK = 5;

/** Stateless rank+star from a raw ARR value. Mirrors ranked_rank_for_aar() exactly — that's the database function's actual name, unchanged by this rename. */
export function rankForArr(rating: number): { tier: RankedTier; pips: RankedPips } {
  const band = RANK_THRESHOLDS.find((r) => rating < r.floor + r.width) ?? RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1];
  const starWidth = band.width === Infinity ? 200 / STARS_PER_RANK : band.width / STARS_PER_RANK;
  const offset = rating - band.floor;
  const pips = Math.min(STARS_PER_RANK, Math.max(1, Math.floor(offset / starWidth) + 1)) as RankedPips;
  return { tier: band.tier as RankedTier, pips };
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V'] as const;

export function pipNumeral(pips: RankedPips): string {
  return NUMERALS[Math.min(Math.max(pips, 1), RANKED_PIPS_PER_TIER) - 1];
}

/** "ACE IV". */
export function rankLabel(tier: RankedTier, pips: RankedPips): string {
  return `${tierInfo(tier).name} ${pipNumeral(pips)}`;
}

export type PipState = 'filled' | 'empty';

export function pipRow(pips: RankedPips): PipState[] {
  return Array.from({ length: RANKED_PIPS_PER_TIER }, (_, i) => (i < pips ? 'filled' : 'empty'));
}

export type ClimbState = {
  /** 0-1, how far through the current tier's five stars. */
  progress: number;
  nextTier: RankedTier | null;
  /** Close to promotion, never a guarantee — rank is derived continuously from ARR. */
  nearPromotion: boolean;
  atCeiling: boolean;
};

export function climbState(rank: Pick<PlayerRank, 'tier' | 'pips'>): ClimbState {
  const atCeiling = rank.tier >= RANKED_TIER_COUNT;
  return {
    progress: rank.pips / RANKED_PIPS_PER_TIER,
    nextTier: atCeiling ? null : ((rank.tier + 1) as RankedTier),
    nearPromotion: rank.pips >= RANKED_PIPS_PER_TIER && !atCeiling,
    atCeiling,
  };
}

export type CalibrationState = { calibrating: boolean; played: number; remaining: number; total: number };

export function calibrationState(rank: Pick<PlayerRank, 'is_calibrated' | 'calibration_matches'>): CalibrationState {
  const played = Math.min(rank.calibration_matches, RANKED_CALIBRATION_MATCHES);
  return {
    calibrating: !rank.is_calibrated,
    played,
    remaining: Math.max(0, RANKED_CALIBRATION_MATCHES - played),
    total: RANKED_CALIBRATION_MATCHES,
  };
}

export function winRate(rank: Pick<PlayerRank, 'wins' | 'losses'>): number | null {
  const played = rank.wins + rank.losses;
  return played === 0 ? null : rank.wins / played;
}

export function formatWinRate(rank: Pick<PlayerRank, 'wins' | 'losses'>): string {
  const rate = winRate(rank);
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;
}

/** ARR is shown grouped — a four-digit number reads as a rating, not a year. */
export function formatRating(rating: number): string {
  return rating.toLocaleString('en-PH');
}

/** "+32" / "−24". A real minus sign, not a hyphen. */
export function formatRatingDelta(delta: number): string {
  return delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

export function formatReliability(reliability: number): string {
  return `${Math.round(reliability)}%`;
}

export type PartyArrEligibility = {
  eligible: boolean;
  spread: number;
  allowedLowestRating: number | null;
  allowedHighestRating: number | null;
};

/**
 * Mirrors ranked_party_spread()'s ARR-based rule. Uncalibrated players
 * are excluded — they have no meaningful rating to compare yet, and
 * excluding them is what makes the placement matches playable at all.
 * A preview only: the button this gates just re-tries after the server's
 * own rejection either way.
 */
export function partyArrEligibility(
  party: readonly (Pick<PlayerRank, 'rating' | 'is_calibrated'> | null | undefined)[]
): PartyArrEligibility {
  const ratings = party
    .filter((p): p is Pick<PlayerRank, 'rating' | 'is_calibrated'> => Boolean(p?.is_calibrated))
    .map((p) => p.rating);
  if (ratings.length === 0) {
    return { eligible: true, spread: 0, allowedLowestRating: null, allowedHighestRating: null };
  }
  const lowestRating = Math.min(...ratings);
  const highestRating = Math.max(...ratings);
  const spread = highestRating - lowestRating;
  return {
    eligible: spread <= RANKED_MAX_PARTY_ARR_SPREAD,
    spread,
    allowedLowestRating: highestRating - RANKED_MAX_PARTY_ARR_SPREAD,
    allowedHighestRating: lowestRating + RANKED_MAX_PARTY_ARR_SPREAD,
  };
}

export type PartyEligibilityDisplay = PartyArrEligibility & {
  allowedLowestTierName: string | null;
  allowedHighestTierName: string | null;
  maxSpread: number;
};

/** Wraps partyArrEligibility() with tier NAMES for a "Volleyer → Kitchen King" style message — display only. */
export function partyEligibilityDisplay(
  party: readonly (Pick<PlayerRank, 'rating' | 'is_calibrated'> | null | undefined)[]
): PartyEligibilityDisplay {
  const result = partyArrEligibility(party);
  return {
    ...result,
    allowedLowestTierName: result.allowedLowestRating === null ? null : tierInfo(rankForArr(result.allowedLowestRating).tier).name,
    allowedHighestTierName: result.allowedHighestRating === null ? null : tierInfo(rankForArr(result.allowedHighestRating).tier).name,
    maxSpread: RANKED_MAX_PARTY_ARR_SPREAD,
  };
}

export type MatchBalance = { bars: number; label: string; gap: number };

const BALANCE_LABELS = ['Lopsided', 'Uneven', 'Fair', 'Even', 'Very even'] as const;

/** Turns the ARR gap between two sides into a five-bar meter. */
export function matchBalance(teamARatings: number[], teamBRatings: number[]): MatchBalance {
  const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
  const gap = Math.abs(mean(teamARatings) - mean(teamBRatings));
  const bars = gap < 25 ? 5 : gap < 60 ? 4 : gap < 110 ? 3 : gap < 200 ? 2 : 1;
  return { bars, label: BALANCE_LABELS[bars - 1], gap: Math.round(gap) };
}

export type OfficiatingTally = { approved: number; total: number; unanimous: boolean };

export function officiatingTally(players: readonly (Pick<RankedMatchPlayer, 'officiating_vote'>)[]): OfficiatingTally {
  const approved = players.filter((p) => p.officiating_vote === true).length;
  return { approved, total: players.length, unanimous: players.length > 0 && approved === players.length };
}

export type ReadyTally = { ready: number; total: number; allReady: boolean };

export function readyTally(players: readonly (Pick<RankedMatchPlayer, 'ready'>)[]): ReadyTally {
  const ready = players.filter((p) => p.ready).length;
  return { ready, total: players.length, allReady: players.length > 0 && ready === players.length };
}

export type ConfirmationTally = { accepted: number; total: number; disputed: boolean };

export function confirmationTally(players: readonly (Pick<RankedMatchPlayer, 'result_response'>)[]): ConfirmationTally {
  return {
    accepted: players.filter((p) => p.result_response === 'accepted').length,
    total: players.length,
    disputed: players.some((p) => p.result_response === 'disputed'),
  };
}

/** Whether a score is a finished game under the match's own rules — mirrors submit_ranked_result()'s guard. */
export function isFinishedGame(match: Pick<RankedMatch, 'score_a' | 'score_b' | 'target_score' | 'win_by'>): boolean {
  const high = Math.max(match.score_a, match.score_b);
  const low = Math.min(match.score_a, match.score_b);
  return high >= match.target_score && high - low >= match.win_by;
}

export const RANKED_DISPUTE_REASONS = ['Incorrect score', 'Wrong winner', 'Wrong player', 'Other'] as const;
export type RankedDisputeReason = (typeof RANKED_DISPUTE_REASONS)[number];

export function matchStatusLabel(match: Pick<RankedMatch, 'status'>): string {
  switch (match.status) {
    case 'lobby':
      return 'Waiting on players';
    case 'officiating':
      return 'Choosing a scorekeeper';
    case 'live':
      return 'In play';
    case 'awaiting_confirmation':
      return 'Confirming result';
    case 'confirmed':
      return 'Final';
    case 'disputed':
      return 'Disputed';
    case 'cancelled':
      return 'Cancelled';
  }
}

/* -------------------------------------------------------------------------
 * Reads
 * ---------------------------------------------------------------------- */

/** The signed-in player's standing for the open season, or null if they've never opened Ranked. */
export async function getPlayerRank(userId: string): Promise<PlayerRank | null> {
  const { data, error } = await supabase
    .from('player_ranks')
    .select('*')
    .eq('user_id', userId)
    .order('season_id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Batched — one query for a whole lobby, not one per player card. */
export async function getPlayerRanks(userIds: string[]): Promise<Map<string, PlayerRank>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase.from('player_ranks').select('*').in('user_id', userIds);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.user_id, row]));
}

export async function listLeaderboard(limit = 50): Promise<RankedLeaderboardRow[]> {
  const { data, error } = await supabase
    .from('ranked_leaderboard')
    .select('*')
    .order('position', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** One player's row on the leaderboard, wherever it falls — fetched separately so a "you are 48th" footer doesn't need the 47 rows above it. */
export async function getLeaderboardEntry(userId: string): Promise<RankedLeaderboardRow | null> {
  const { data, error } = await supabase
    .from('ranked_leaderboard')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * A player's wins/losses across EVERY confirmed match, casual results
 * included — what "total wins whether it's a normal game or a ranked
 * game" actually means. Deliberately not PlayerRank.wins/losses: those
 * stay ranked-only because they're what the rating is computed from.
 * Null when the player has no confirmed matches at all (the view has
 * no row for them), which callers should read as zero, not as an error.
 */
export async function getPlayerMatchTotals(userId: string): Promise<PlayerMatchTotals | null> {
  const { data, error } = await supabase
    .from('player_match_totals')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type RankedMatchParticipant = RankedMatchPlayer & {
  profile: PublicProfile | null;
  rank: PlayerRank | null;
};

export type ClubRef = { id: string; name: string };

export type RankedMatchDetail = RankedMatch & {
  players: RankedMatchParticipant[];
  /** Null when nobody has been proposed yet, or when the referee isn't a player. */
  scorekeeper: PublicProfile | null;
  /** Resolved live by JOIN when team_a_club_id is set — see that
   * column's own comment for why this isn't frozen at selection time. */
  team_a_club: ClubRef | null;
  team_b_club: ClubRef | null;
};

/** Batched — one query for both teams' club names, not two. */
async function fetchClubRefs(ids: (string | null)[]): Promise<Map<string, ClubRef>> {
  const real = [...new Set(ids.filter((id): id is string => id !== null))];
  if (real.length === 0) return new Map();
  const { data, error } = await supabase.from('clubs').select('id,name').in('id', real);
  if (error) throw error;
  return new Map((data ?? []).map((c) => [c.id, c]));
}

export type MyMatchResult = {
  me: RankedMatchParticipant;
  won: boolean;
  myScore: number;
  theirScore: number;
  /** tier_before is null exactly when this was the match that completed
   * calibration — there was no visible ladder position before it, so
   * that's a placement, not a promotion or demotion. */
  justPlaced: boolean;
  promoted: boolean;
  demoted: boolean;
};

/** currentUserId's personal read of a finished match — which side their
 * score was, whether they won, and whether their tier moved. Null if
 * currentUserId isn't one of the match's players. Shared by the result
 * screen and its share card so the two can't drift apart. */
export function myMatchResult(
  match: Pick<RankedMatch, 'winning_team' | 'score_a' | 'score_b'>,
  players: readonly RankedMatchParticipant[],
  currentUserId: string
): MyMatchResult | null {
  const me = players.find((p) => p.user_id === currentUserId);
  if (!me) return null;

  const myScore = me.team === 'a' ? match.score_a : match.score_b;
  const theirScore = me.team === 'a' ? match.score_b : match.score_a;
  const justPlaced = me.tier_before === null && me.tier_after !== null;
  const promoted = me.tier_before !== null && me.tier_after !== null && me.tier_after > me.tier_before;
  const demoted = me.tier_before !== null && me.tier_after !== null && me.tier_after < me.tier_before;

  return { me, won: match.winning_team === me.team, myScore, theirScore, justPlaced, promoted, demoted };
}

export type RatingImpact =
  | { kind: 'applied'; discounted: boolean }
  | { kind: 'none' };

/**
 * Whether THIS result screen should show a rank/tier/ARR-delta block at
 * all — 'none' means the whole match was rated: false, nobody's rating
 * moved, this isn't personal, it's what the game type meant from the
 * start.
 *
 * 20260810000100's full freeze (a calibrated participant's rating
 * simply never moving on an unbooked rated match) is retired, not
 * renamed — 20260810000112 supersedes it with a half-rate discount
 * instead of a skip, so a confirmed match's delta is never null for a
 * rated participant anymore. `discounted` carries what 'frozen' used
 * to: true when this specific player's delta was halved because they
 * were already calibrated and the match had no booking behind it. Per
 * participant, not per match — a still-calibrating teammate on the
 * SAME match moves at full rate regardless of booking, so read it off
 * the player's own row (rating_discounted), never derived client-side.
 */
export function ratingImpact(
  match: Pick<RankedMatch, 'rated'>,
  me: Pick<RankedMatchPlayer, 'rating_discounted'>
): RatingImpact {
  if (!match.rated) return { kind: 'none' };
  return { kind: 'applied', discounted: me.rating_discounted };
}

/** Display names of everyone on the opposing team, "&"-joined for doubles. */
export function opponentNames(players: readonly RankedMatchParticipant[], me: Pick<RankedMatchParticipant, 'team'>): string {
  return players
    .filter((p) => p.team !== me.team)
    .map((p) => p.profile?.display_name ?? 'a player')
    .join(' & ');
}

async function attachParticipants(players: RankedMatchPlayer[]): Promise<RankedMatchParticipant[]> {
  const ids = players.map((p) => p.user_id);
  if (ids.length === 0) return [];

  const [profilesResult, ranks] = await Promise.all([
    supabase.from('public_profiles').select('*').in('id', ids),
    getPlayerRanks(ids),
  ]);
  if (profilesResult.error) throw profilesResult.error;

  const byId = new Map((profilesResult.data ?? []).map((p) => [p.id, p]));
  return players.map((player) => ({
    ...player,
    profile: byId.get(player.user_id) ?? null,
    rank: ranks.get(player.user_id) ?? null,
  }));
}

export async function getMatch(matchId: string): Promise<RankedMatchDetail | null> {
  const { data: match, error } = await supabase.from('ranked_matches').select('*').eq('id', matchId).maybeSingle();
  if (error) throw error;
  if (!match) return null;

  const { data: playerRows, error: playersError } = await supabase
    .from('ranked_match_players')
    .select('*')
    .eq('match_id', matchId);
  if (playersError) throw playersError;

  const players = await attachParticipants(playerRows ?? []);

  let scorekeeper = players.find((p) => p.user_id === match.scorekeeper_id)?.profile ?? null;
  if (!scorekeeper && match.scorekeeper_id) {
    const { data } = await supabase.from('public_profiles').select('*').eq('id', match.scorekeeper_id).maybeSingle();
    scorekeeper = data ?? null;
  }

  // Team A first, then B, host first within each.
  players.sort((a, b) => (a.team === b.team ? Number(b.is_host) - Number(a.is_host) : a.team.localeCompare(b.team)));

  const clubs = await fetchClubRefs([match.team_a_club_id, match.team_b_club_id]);

  return {
    ...match,
    players,
    scorekeeper,
    team_a_club: match.team_a_club_id ? (clubs.get(match.team_a_club_id) ?? null) : null,
    team_b_club: match.team_b_club_id ? (clubs.get(match.team_b_club_id) ?? null) : null,
  };
}

export async function listMatchPoints(matchId: string): Promise<RankedMatchPoint[]> {
  const { data, error } = await supabase.from('ranked_match_points').select('*').eq('match_id', matchId).order('seq', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

const ACTIVE_MATCH_STATUSES: RankedMatchStatus[] = ['lobby', 'officiating', 'live', 'awaiting_confirmation'];

/** The match a player should be dropped back into when they reopen the app. Most recent first; normally at most one. */
export async function getActiveMatch(userId: string): Promise<RankedMatchDetail | null> {
  const { data, error } = await supabase.from('ranked_match_players').select('match_id').eq('user_id', userId);
  if (error) throw error;
  if (!data || data.length === 0) return null;

  const { data: matches, error: matchError } = await supabase
    .from('ranked_matches')
    .select('id')
    .in(
      'id',
      data.map((row) => row.match_id)
    )
    .in('status', ACTIVE_MATCH_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1);
  if (matchError) throw matchError;
  if (!matches || matches.length === 0) return null;

  return getMatch(matches[0].id);
}

/** The event's own active ranked match, if one is underway — same
 * event → "still going" bridge as the web event page. RLS on
 * ranked_matches means a match in progress only comes back here for
 * its own participants/creator/scorekeeper/admin; a fellow attendee
 * who isn't in that particular match sees nothing and the caller
 * falls through to the "start one" bridge instead, even though one is
 * already underway elsewhere in this session. Pre-existing scope
 * limit inherited from the policy, not something this query adds. */
export async function getActiveMatchForEvent(eventId: string): Promise<Pick<RankedMatch, 'id' | 'status'> | null> {
  const { data, error } = await supabase
    .from('ranked_matches')
    .select('id, status')
    .eq('event_id', eventId)
    .in('status', ACTIVE_MATCH_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0] as unknown as Pick<RankedMatch, 'id' | 'status'>;
}

export type RankedMatchSummary = {
  match: RankedMatch;
  /** The viewer's own line in this match. */
  me: RankedMatchPlayer;
  opponents: PublicProfile[];
  partner: PublicProfile | null;
  won: boolean;
  /** Resolved live — see RankedMatchDetail's own fields for why. */
  teamAClub: ClubRef | null;
  teamBClub: ClubRef | null;
};

/**
 * Confirmed matches only — an unresolved dispute has moved nothing, so
 * showing it in a history of results would be a lie about the record.
 * Singles and doubles share one rating now, so this is one unified
 * history — no mode filter.
 */
export async function listRecentMatches(userId: string, limit = 10): Promise<RankedMatchSummary[]> {
  const { data: mine, error } = await supabase
    .from('ranked_match_players')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit * 2);
  if (error) throw error;
  if (!mine || mine.length === 0) return [];

  const { data: matches, error: matchError } = await supabase
    .from('ranked_matches')
    .select('*')
    .in(
      'id',
      mine.map((row) => row.match_id)
    )
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: false })
    .limit(limit);
  if (matchError) throw matchError;
  if (!matches || matches.length === 0) return [];

  const { data: everyone, error: everyoneError } = await supabase
    .from('ranked_match_players')
    .select('*')
    .in(
      'match_id',
      matches.map((m) => m.id)
    );
  if (everyoneError) throw everyoneError;
  const everyoneRows = everyone ?? [];

  const otherIds = [...new Set(everyoneRows.filter((p) => p.user_id !== userId).map((p) => p.user_id))];
  const { data: profiles, error: profileError } = await supabase
    .from('public_profiles')
    .select('*')
    .in('id', otherIds.length > 0 ? otherIds : ['00000000-0000-0000-0000-000000000000']);
  if (profileError) throw profileError;
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const myLineByMatch = new Map(mine.map((row) => [row.match_id, row]));

  const clubs = await fetchClubRefs(matches.flatMap((m) => [m.team_a_club_id, m.team_b_club_id]));

  return matches.flatMap((match) => {
    const me = myLineByMatch.get(match.id);
    if (!me) return [];
    const others = everyoneRows.filter((p) => p.match_id === match.id && p.user_id !== userId);
    return [
      {
        match,
        me,
        partner: profileById.get(others.find((p) => p.team === me.team)?.user_id ?? '') ?? null,
        opponents: others
          .filter((p) => p.team !== me.team)
          .map((p) => profileById.get(p.user_id))
          .filter((p): p is PublicProfile => p !== undefined),
        won: match.winning_team === me.team,
        teamAClub: match.team_a_club_id ? (clubs.get(match.team_a_club_id) ?? null) : null,
        teamBClub: match.team_b_club_id ? (clubs.get(match.team_b_club_id) ?? null) : null,
      },
    ];
  });
}

/** Players in the same Open Play session who could referee — anyone attending who isn't on court for this match. */
export async function listRefereeCandidates(eventId: string, excludeUserIds: string[]): Promise<PublicProfile[]> {
  const { data, error } = await supabase.from('event_attendees').select('user_id').eq('event_id', eventId).eq('status', 'joined');
  if (error) throw error;

  const excluded = new Set(excludeUserIds);
  const ids = (data ?? []).map((row) => row.user_id).filter((id) => !excluded.has(id));
  if (ids.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase.from('public_profiles').select('*').in('id', ids);
  if (profileError) throw profileError;
  return profiles ?? [];
}

/* -------------------------------------------------------------------------
 * Writes — thin wrappers over the RPCs. Every one is SECURITY DEFINER;
 * this is the only write path for any Ranked table.
 * ---------------------------------------------------------------------- */

export async function ensureMyPlayerRank(): Promise<void> {
  const { error } = await supabase.rpc('ensure_my_player_rank');
  if (error) throwRanked(error);
}

export async function getPartySpread(userIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('ranked_party_spread', { p_user_ids: userIds });
  if (error) throwRanked(error);
  return data ?? 0;
}

export type CreateRankedMatchInput = {
  matchType: RankedMatchType;
  teamA: string[];
  teamB: string[];
  eventId?: string | null;
  courtId?: string | null;
  /** Defaults true, matching create_ranked_match()'s own default — an
   * omitted value here behaves exactly like every call site before this
   * field existed. */
  rated?: boolean;
};

/** Returns the new match's id. The caller must be one of the players. */
export async function createRankedMatch(input: CreateRankedMatchInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_ranked_match', {
    p_match_type: input.matchType,
    p_team_a: input.teamA,
    p_team_b: input.teamB,
    p_event_id: input.eventId ?? null,
    p_court_id: input.courtId ?? null,
    p_rated: input.rated ?? true,
  });
  if (error) throwRanked(error);
  return data as string;
}

/**
 * Whether a match's booking is real, exactly as apply_ranked_result()
 * itself will check at confirmation time — calls the server's own
 * ranked_match_is_booked() rather than re-deriving "booked" client-side
 * from event_id/court_id, which the migration that introduced this
 * explicitly says is spoofable (a player can attach any court's uuid).
 * The server is the one source of truth for whether this match will
 * freeze a calibrated player.
 */
export async function isMatchBooked(matchId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('ranked_match_is_booked', { p_match_id: matchId });
  if (error) throw error;
  return data ?? false;
}

/**
 * Names a doubles team, or picks a club the caller belongs to — never
 * both (set_ranked_team_identity() enforces this, but the database's
 * own CHECK constraint is what actually guarantees it). Lobby-only:
 * the server rejects this once the match has left 'lobby', same gate
 * setReady() itself is under. Pass exactly one of name/clubId; passing
 * neither clears whichever was set (last-write-wins between teammates
 * — a team name is cosmetic, not something worth a vote over).
 */
export async function setTeamIdentity(
  matchId: string,
  team: RankedTeam,
  identity: { name: string } | { clubId: string } | null
): Promise<void> {
  const { error } = await supabase.rpc('set_ranked_team_identity', {
    p_match_id: matchId,
    p_team: team,
    p_name: identity && 'name' in identity ? identity.name : null,
    p_club_id: identity && 'clubId' in identity ? identity.clubId : null,
  });
  if (error) throwRanked(error);
}

export type TeamIdentity =
  | { kind: 'custom'; label: string }
  | { kind: 'club'; label: string; clubId: string }
  | { kind: 'players'; label: string };

/**
 * The founder's own rule, verbatim: "if double should show team name
 * if single just the player name" — keyed on match type, not on
 * whether a name happens to be set. A singles match has no team to
 * name at all; showing player names there isn't a fallback, it's the
 * only thing that was ever going to be correct. An unnamed doubles
 * team falls back to its players' names too — the same shape, just for
 * a different reason (nobody chose an identity yet).
 */
export function teamIdentityLabel({
  matchType,
  teamName,
  club,
  playerNames,
}: {
  matchType: RankedMatchType;
  teamName: string | null;
  club: ClubRef | null;
  /** Pre-joined display name(s) for the team's player(s) — the
   * existing fallback every surface already had before team identity
   * existed (teamNames()/opponentNames()-style joins). */
  playerNames: string;
}): TeamIdentity {
  if (matchType === 'singles') return { kind: 'players', label: playerNames };
  if (club) return { kind: 'club', label: club.name, clubId: club.id };
  if (teamName) return { kind: 'custom', label: teamName };
  return { kind: 'players', label: playerNames };
}

export type RankedStakes = {
  headline: string;
  detail: string;
  tone: 'neutral' | 'info' | 'warning';
};

/**
 * What this match means for the CURRENT PLAYER's rating, worded for
 * exactly their situation — not the match's, since 20260810000112's
 * unbooked discount is decided per participant. In a mixed doubles
 * lobby one player can be discounted to half rate while their partner
 * still calibrates normally (full rate, no booking needed); a single
 * match-level message would be wrong for one of them half the time.
 * Shown before the match starts (the doorway, and the lobby for
 * anyone who joined via a link and never saw the doorway) so nobody
 * discovers what a match did to their rating only after playing it.
 *
 * `booked` is undefined while still loading (e.g. the lobby's
 * isMatchBooked() call hasn't resolved yet) — callers should treat that
 * as "don't know yet" rather than guessing either way.
 */
export function rankedStakes({
  rated,
  booked,
  isCalibrated,
}: {
  rated: boolean;
  booked: boolean | undefined;
  isCalibrated: boolean;
}): RankedStakes {
  if (!rated) {
    return {
      headline: 'Casual',
      detail: 'Wins and losses are recorded, but nothing here affects your rating.',
      tone: 'neutral',
    };
  }
  if (!isCalibrated) {
    return {
      headline: 'Ranked',
      detail: 'Counts toward your 10 calibration matches — no booking needed for this part.',
      tone: 'info',
    };
  }
  if (booked === false) {
    return {
      headline: 'Ranked',
      detail: "Recorded — counts at half rate, since this isn't at a booked court. Book a court to move at full rate.",
      tone: 'warning',
    };
  }
  return {
    headline: 'Ranked',
    detail: 'Counts toward your AIR/Rally rating.',
    tone: 'neutral',
  };
}

export async function setReady(matchId: string, ready: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_ranked_ready', { p_match_id: matchId, p_ready: ready });
  if (error) throwRanked(error);
}

export async function proposeOfficiating(matchId: string, mode: RankedOfficiatingMode, scorekeeperId: string): Promise<void> {
  const { error } = await supabase.rpc('propose_ranked_officiating', {
    p_match_id: matchId,
    p_mode: mode,
    p_scorekeeper_id: scorekeeperId,
  });
  if (error) throwRanked(error);
}

export async function voteOfficiating(matchId: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('vote_ranked_officiating', { p_match_id: matchId, p_approve: approve });
  if (error) throwRanked(error);
}

export async function recordPoint(matchId: string, team: RankedTeam): Promise<void> {
  const { error } = await supabase.rpc('record_ranked_point', { p_match_id: matchId, p_team: team });
  if (error) throwRanked(error);
}

export async function undoPoint(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('undo_ranked_point', { p_match_id: matchId });
  if (error) throwRanked(error);
}

export async function submitResult(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_ranked_result', { p_match_id: matchId });
  if (error) throwRanked(error);
}

export async function respondToResult(matchId: string, accept: boolean, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('respond_ranked_result', { p_match_id: matchId, p_accept: accept, p_reason: reason ?? null });
  if (error) throwRanked(error);
}

export async function cancelMatch(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_ranked_match', { p_match_id: matchId });
  if (error) throwRanked(error);
}

/** Granted to anon+authenticated directly. The write RPCs above resolve the season internally; this is only for a client that wants to know it too. */
export async function getCurrentSeason(): Promise<number | null> {
  const { data, error } = await supabase.rpc('current_ranked_season');
  if (error) throwRanked(error);
  return data;
}
