import type { PostgrestError } from '@supabase/supabase-js';

import type {
  PlayerRank,
  PublicProfile,
  RankedLeaderboardRow,
  RankedMatch,
  RankedMatchPlayer,
  RankedMatchPoint,
  RankedMatchStatus,
  RankedMatchType,
  RankedMode,
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

export const RATING_STARTING_VALUE = 1000;

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
/** The party-spread cap — a ranked doubles party's members must all sit within this many AAR points of each other. */
export const RANKED_MAX_PARTY_AAR_SPREAD = 250;

export type RankedTierInfo = (typeof RANK_THRESHOLDS)[number];

export function tierInfo(tier: RankedTier): RankedTierInfo {
  const index = Math.min(Math.max(tier, 1), RANKED_TIER_COUNT) - 1;
  return RANK_THRESHOLDS[index];
}

const STARS_PER_RANK = 5;

/** Stateless rank+star from a raw AAR value. Mirrors ranked_rank_for_aar() exactly. */
export function rankForAar(rating: number): { tier: RankedTier; pips: RankedPips } {
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
  /** Close to promotion, never a guarantee — rank is derived continuously from AAR. */
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

/** AAR is shown grouped — a four-digit number reads as a rating, not a year. */
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

export type PartyAarEligibility = {
  eligible: boolean;
  spread: number;
  allowedLowestRating: number | null;
  allowedHighestRating: number | null;
};

/**
 * Mirrors ranked_party_spread()'s AAR-based rule. Uncalibrated players
 * are excluded — they have no meaningful rating to compare yet, and
 * excluding them is what makes the placement matches playable at all.
 * A preview only: the button this gates just re-tries after the server's
 * own rejection either way.
 */
export function partyAarEligibility(
  party: readonly (Pick<PlayerRank, 'rating' | 'is_calibrated'> | null | undefined)[]
): PartyAarEligibility {
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
    eligible: spread <= RANKED_MAX_PARTY_AAR_SPREAD,
    spread,
    allowedLowestRating: highestRating - RANKED_MAX_PARTY_AAR_SPREAD,
    allowedHighestRating: lowestRating + RANKED_MAX_PARTY_AAR_SPREAD,
  };
}

export type PartyEligibilityDisplay = PartyAarEligibility & {
  allowedLowestTierName: string | null;
  allowedHighestTierName: string | null;
  maxSpread: number;
};

/** Wraps partyAarEligibility() with tier NAMES for a "Volleyer → Kitchen King" style message — display only. */
export function partyEligibilityDisplay(
  party: readonly (Pick<PlayerRank, 'rating' | 'is_calibrated'> | null | undefined)[]
): PartyEligibilityDisplay {
  const result = partyAarEligibility(party);
  return {
    ...result,
    allowedLowestTierName: result.allowedLowestRating === null ? null : tierInfo(rankForAar(result.allowedLowestRating).tier).name,
    allowedHighestTierName: result.allowedHighestRating === null ? null : tierInfo(rankForAar(result.allowedHighestRating).tier).name,
    maxSpread: RANKED_MAX_PARTY_AAR_SPREAD,
  };
}

export type MatchBalance = { bars: number; label: string; gap: number };

const BALANCE_LABELS = ['Lopsided', 'Uneven', 'Fair', 'Even', 'Very even'] as const;

/** Turns the AAR gap between two sides into a five-bar meter. */
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

/** The signed-in player's standing for the open season in this mode, or null if they've never opened Ranked in it. */
export async function getPlayerRank(userId: string, mode: RankedMode): Promise<PlayerRank | null> {
  const { data, error } = await supabase
    .from('player_ranks')
    .select('*')
    .eq('user_id', userId)
    .eq('mode', mode)
    .order('season_id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Batched — one query for a whole lobby, not one per player card. Always for one mode. */
export async function getPlayerRanks(userIds: string[], mode: RankedMode): Promise<Map<string, PlayerRank>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase.from('player_ranks').select('*').in('user_id', userIds).eq('mode', mode);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.user_id, row]));
}

export async function listLeaderboard(mode: RankedMode, limit = 50): Promise<RankedLeaderboardRow[]> {
  const { data, error } = await supabase
    .from('ranked_leaderboard')
    .select('*')
    .eq('mode', mode)
    .order('position', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** One player's row on the leaderboard, wherever it falls — fetched separately so a "you are 48th" footer doesn't need the 47 rows above it. */
export async function getLeaderboardEntry(userId: string, mode: RankedMode): Promise<RankedLeaderboardRow | null> {
  const { data, error } = await supabase
    .from('ranked_leaderboard')
    .select('*')
    .eq('user_id', userId)
    .eq('mode', mode)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type RankedMatchParticipant = RankedMatchPlayer & {
  profile: PublicProfile | null;
  rank: PlayerRank | null;
};

export type RankedMatchDetail = RankedMatch & {
  players: RankedMatchParticipant[];
  /** Null when nobody has been proposed yet, or when the referee isn't a player. */
  scorekeeper: PublicProfile | null;
};

async function attachParticipants(players: RankedMatchPlayer[], mode: RankedMode): Promise<RankedMatchParticipant[]> {
  const ids = players.map((p) => p.user_id);
  if (ids.length === 0) return [];

  const [profilesResult, ranks] = await Promise.all([
    supabase.from('public_profiles').select('*').in('id', ids),
    getPlayerRanks(ids, mode),
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

  const players = await attachParticipants(playerRows ?? [], match.match_type);

  let scorekeeper = players.find((p) => p.user_id === match.scorekeeper_id)?.profile ?? null;
  if (!scorekeeper && match.scorekeeper_id) {
    const { data } = await supabase.from('public_profiles').select('*').eq('id', match.scorekeeper_id).maybeSingle();
    scorekeeper = data ?? null;
  }

  // Team A first, then B, host first within each.
  players.sort((a, b) => (a.team === b.team ? Number(b.is_host) - Number(a.is_host) : a.team.localeCompare(b.team)));

  return { ...match, players, scorekeeper };
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

export type RankedMatchSummary = {
  match: RankedMatch;
  /** The viewer's own line in this match. */
  me: RankedMatchPlayer;
  opponents: PublicProfile[];
  partner: PublicProfile | null;
  won: boolean;
};

/**
 * Confirmed matches only — an unresolved dispute has moved nothing, so
 * showing it in a history of results would be a lie about the record.
 * Filtered to one mode.
 */
export async function listRecentMatches(userId: string, mode: RankedMode, limit = 10): Promise<RankedMatchSummary[]> {
  const { data: mine, error } = await supabase
    .from('ranked_match_players')
    .select('*')
    .eq('user_id', userId)
    .eq('mode', mode)
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

export async function ensureMyPlayerRank(mode: RankedMode): Promise<void> {
  const { error } = await supabase.rpc('ensure_my_player_rank', { p_mode: mode });
  if (error) throwRanked(error);
}

export async function getPartySpread(userIds: string[], mode: RankedMode): Promise<number> {
  const { data, error } = await supabase.rpc('ranked_party_spread', { p_user_ids: userIds, p_mode: mode });
  if (error) throwRanked(error);
  return data ?? 0;
}

export type CreateRankedMatchInput = {
  matchType: RankedMatchType;
  teamA: string[];
  teamB: string[];
  eventId?: string | null;
  courtId?: string | null;
};

/** Returns the new match's id. The caller must be one of the players. */
export async function createRankedMatch(input: CreateRankedMatchInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_ranked_match', {
    p_match_type: input.matchType,
    p_team_a: input.teamA,
    p_team_b: input.teamB,
    p_event_id: input.eventId ?? null,
    p_court_id: input.courtId ?? null,
  });
  if (error) throwRanked(error);
  return data as string;
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
