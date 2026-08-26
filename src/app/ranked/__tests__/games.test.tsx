import { render, screen } from '@testing-library/react-native';
import React from 'react';

import GamesScreen from '@/app/ranked/games';
import type { PlayerRank, RankedMatch, RankedMatchPlayer } from '@/lib/database.types';
import { getPlayerRank, listRecentMatches, type RankedMatchSummary } from '@/lib/ranked';

/**
 * Replaces Profile's old "Open Play" shortcut and rank-card.tsx's
 * "Match history" destination. The founder's spec: a stats card
 * (wins/losses/win rate/rank+badge/AAR), or calibration progress
 * below 10 matches — pinned here as a property of the RENDERED card,
 * not which internal branch produced it, since `rank === null` (never
 * opened Ranked) and an unplaced PlayerRank row both have to reach the
 * same calibrating display.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getPlayerRank: jest.fn(),
  listRecentMatches: jest.fn(),
}));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

const mockGetPlayerRank = getPlayerRank as jest.MockedFunction<typeof getPlayerRank>;
const mockListRecentMatches = listRecentMatches as jest.MockedFunction<typeof listRecentMatches>;

function rankFixture(overrides: Partial<PlayerRank>): PlayerRank {
  return {
    season_id: 1,
    user_id: 'me',
    rating: 1250,
    tier: 3,
    pips: 2,
    reliability: 80,
    sandbag_risk_score: 0,
    last_match_at: '2026-08-20T00:00:00.000Z',
    in_promotion_series: false,
    star_protection: 0,
    calibration_matches: 10,
    is_calibrated: true,
    wins: 6,
    losses: 4,
    current_streak: 1,
    best_streak: 3,
    best_tier: 3,
    best_pips: 2,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

function matchFixture(overrides: Partial<RankedMatch> = {}): RankedMatch {
  return {
    id: 'match-1',
    season_id: 1,
    event_id: null,
    court_id: null,
    venue_id: null,
    match_type: 'singles',
    match_weight_type: 'air_rally_ranked',
    team_a_name: null,
    team_a_club_id: null,
    team_b_name: null,
    team_b_club_id: null,
    rated: true,
    status: 'confirmed',
    officiating_mode: null,
    scorekeeper_id: null,
    target_score: 11,
    win_by: 2,
    score_a: 11,
    score_b: 8,
    serving_team: 'a',
    winning_team: 'a',
    rank_applied: true,
    dispute_reason: null,
    created_by: 'me',
    created_at: '2026-08-20T00:00:00.000Z',
    started_at: '2026-08-20T00:00:00.000Z',
    completed_at: '2026-08-20T00:10:00.000Z',
    confirmed_at: '2026-08-20T00:11:00.000Z',
    updated_at: '2026-08-20T00:11:00.000Z',
    ...overrides,
  };
}

function meFixture(overrides: Partial<RankedMatchPlayer> = {}): RankedMatchPlayer {
  return {
    match_id: 'match-1',
    user_id: 'me',
    team: 'a',
    is_host: true,
    mode: 'singles',
    ready: true,
    ready_at: null,
    officiating_vote: true,
    result_response: 'accepted',
    dispute_reason: null,
    rating_before: 1225,
    rating_after: 1250,
    rating_delta: 25,
    tier_before: 3,
    pips_before: 1,
    tier_after: 3,
    pips_after: 2,
    pip_delta: 1,
    star_protected: false,
    expected_score: null,
    actual_score: null,
    performance_gap: null,
    match_weight: null,
    recency_multiplier: null,
    reliability_modifier: null,
    created_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

const MATCH_SUMMARY: RankedMatchSummary = {
  match: matchFixture(),
  me: meFixture(),
  opponents: [{ id: 'opp-1', display_name: 'Robin', avatar_url: null }],
  partner: null,
  won: true,
  teamAClub: null,
  teamBClub: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListRecentMatches.mockResolvedValue([MATCH_SUMMARY]);
});

describe('GamesScreen — stats card', () => {
  it('shows wins, losses, win rate, rank, and AAR for a calibrated player', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ wins: 6, losses: 4, rating: 1250, tier: 3, pips: 2 }));
    await render(<GamesScreen />);

    await screen.findByText('1,250');
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('60.0%')).toBeTruthy();
    expect(screen.getByText('Volleyer II')).toBeTruthy();
  });

  it('labels its win/loss figures as RANKED — Profile shows a different, casual-inclusive total', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ wins: 6, losses: 4 }));
    await render(<GamesScreen />);

    await screen.findByText('Ranked wins');
    expect(screen.getByText('Ranked losses')).toBeTruthy();
    // A bare "Wins" here would read as the same number Profile shows,
    // disagreeing with itself.
    expect(screen.queryByText('Wins')).toBeNull();
    expect(screen.queryByText('Losses')).toBeNull();
  });

  it('shows calibration progress instead, below 10 matches', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 3 }));
    await render(<GamesScreen />);

    await screen.findByText('3 of 10 calibration matches played');
    expect(screen.queryByText('AIR/Rally Rating')).toBeNull();
  });

  it('treats a player who has never opened Ranked the same as 0 of 10 — not a crash, not a separate empty state', async () => {
    mockGetPlayerRank.mockResolvedValue(null);
    await render(<GamesScreen />);

    await screen.findByText('0 of 10 calibration matches played');
  });

  it('still lists confirmed match history below the stats card', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({}));
    await render(<GamesScreen />);

    await screen.findByText('vs Robin');
    expect(screen.getByText('11–8')).toBeTruthy();
  });
});
