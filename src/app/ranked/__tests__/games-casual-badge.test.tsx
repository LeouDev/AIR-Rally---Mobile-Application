import { render, screen } from '@testing-library/react-native';
import React from 'react';

import GamesScreen from '@/app/ranked/games';
import type { RankedMatch, RankedMatchPlayer } from '@/lib/database.types';
import { getPlayerRank, listRecentMatches, type RankedMatchSummary } from '@/lib/ranked';

/**
 * The same casual-vs-frozen distinction as the result screen — a whole
 * casual match reads differently from an otherwise-rated match this
 * player was individually frozen in. History has to say which, same as
 * the result screen does, or a frozen match reads as an unremarkable
 * loss/win with no explanation for why it never moved the rating.
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
    scoring_mode: 'rally',
    server_number: null,
    first_service_turn_used: false,
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
    rating_discounted: false,
    created_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

function summaryFixture(overrides: Partial<RankedMatchSummary> = {}): RankedMatchSummary {
  return {
    match: matchFixture(),
    me: meFixture(),
    opponents: [{ id: 'opp-1', display_name: 'Robin', avatar_url: null }],
    partner: null,
    won: true,
    teamAClub: null,
    teamBClub: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPlayerRank.mockResolvedValue(null);
});

it('badges a casual match as Casual in history', async () => {
  mockListRecentMatches.mockResolvedValue([
    summaryFixture({ match: matchFixture({ rated: false }), me: meFixture({ rating_delta: null, tier_after: null }) }),
  ]);
  await render(<GamesScreen />);

  await screen.findByText('Casual');
});

it('badges a frozen (rated but unbooked-and-calibrated) match as No rating impact, not Casual', async () => {
  mockListRecentMatches.mockResolvedValue([
    summaryFixture({ match: matchFixture({ rated: true }), me: meFixture({ rating_delta: null, tier_after: null }) }),
  ]);
  await render(<GamesScreen />);

  await screen.findByText('No rating impact');
  expect(screen.queryByText('Casual')).toBeNull();
});

it('shows no impact badge at all for a normally-rated match', async () => {
  mockListRecentMatches.mockResolvedValue([summaryFixture()]);
  await render(<GamesScreen />);

  await screen.findByText('Won');
  expect(screen.queryByText('Casual')).toBeNull();
  expect(screen.queryByText('No rating impact')).toBeNull();
});
