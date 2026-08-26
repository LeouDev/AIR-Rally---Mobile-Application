import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { LobbyPhase } from '@/components/ranked/match/lobby-phase';
import type { PlayerRank, RankedMatch } from '@/lib/database.types';
import type { RankedMatchParticipant } from '@/lib/ranked';
import { isMatchBooked } from '@/lib/ranked';

/**
 * The freeze is decided per PARTICIPANT — someone invited into a match
 * never saw the doorway/creation screen, and could open straight into
 * the lobby with no idea whether this counts toward their rating. This
 * pins that the lobby itself fetches bookedness and shows the current
 * viewer's OWN accurate stakes, not a generic one.
 */

jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  isMatchBooked: jest.fn(),
  setReady: jest.fn(),
  cancelMatch: jest.fn(),
}));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));

const mockIsMatchBooked = isMatchBooked as jest.MockedFunction<typeof isMatchBooked>;

function rank(overrides: Partial<PlayerRank> = {}): PlayerRank {
  return {
    season_id: 1,
    user_id: 'me',
    rating: 1200,
    tier: 3,
    pips: 3,
    reliability: 90,
    sandbag_risk_score: 0,
    last_match_at: null,
    in_promotion_series: false,
    star_protection: 0,
    calibration_matches: 10,
    is_calibrated: true,
    wins: 5,
    losses: 3,
    current_streak: 1,
    best_streak: 2,
    best_tier: 3,
    best_pips: 3,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function participant(overrides: Partial<RankedMatchParticipant> = {}): RankedMatchParticipant {
  return {
    match_id: 'match-1',
    user_id: 'me',
    team: 'a',
    is_host: true,
    mode: 'singles',
    ready: false,
    ready_at: null,
    officiating_vote: null,
    result_response: 'pending',
    dispute_reason: null,
    rating_before: null,
    rating_after: null,
    rating_delta: null,
    tier_before: null,
    pips_before: null,
    tier_after: null,
    pips_after: null,
    pip_delta: null,
    star_protected: false,
    expected_score: null,
    actual_score: null,
    performance_gap: null,
    match_weight: null,
    recency_multiplier: null,
    reliability_modifier: null,
    created_at: '2026-08-20T00:00:00.000Z',
    profile: { id: 'me', display_name: 'Leou', avatar_url: null },
    rank: rank(),
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
    status: 'lobby',
    officiating_mode: null,
    scorekeeper_id: null,
    target_score: 11,
    win_by: 2,
    score_a: 0,
    score_b: 0,
    serving_team: 'a',
    winning_team: null,
    rank_applied: false,
    dispute_reason: null,
    created_by: 'me',
    created_at: '2026-08-20T00:00:00.000Z',
    started_at: null,
    completed_at: null,
    confirmed_at: null,
    updated_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('tells a still-calibrating player this counts, before it resolves whether the match is booked', async () => {
  mockIsMatchBooked.mockResolvedValue(false);
  const me = participant({ rank: rank({ is_calibrated: false }) });
  const opp = participant({ user_id: 'opp', team: 'b', is_host: false });

  await render(
    <LobbyPhase match={{ ...matchFixture(), players: [me, opp], scorekeeper: null, team_a_club: null, team_b_club: null }} currentUserId="me" />
  );

  await screen.findByText(/calibration/);
});

it('warns a calibrated player their rating will not move once bookedness resolves to false', async () => {
  mockIsMatchBooked.mockResolvedValue(false);
  const me = participant({ rank: rank({ is_calibrated: true }) });
  const opp = participant({ user_id: 'opp', team: 'b', is_host: false });

  await render(
    <LobbyPhase match={{ ...matchFixture(), players: [me, opp], scorekeeper: null, team_a_club: null, team_b_club: null }} currentUserId="me" />
  );

  await screen.findByText(/won't move/);
  expect(mockIsMatchBooked).toHaveBeenCalledWith('match-1');
});

it('labels a casual match CASUAL for the viewer, regardless of their own calibration', async () => {
  mockIsMatchBooked.mockResolvedValue(false);
  const me = participant({ rank: rank({ is_calibrated: true }) });
  const opp = participant({ user_id: 'opp', team: 'b', is_host: false });

  await render(
    <LobbyPhase match={{ ...matchFixture({ rated: false }), players: [me, opp], scorekeeper: null, team_a_club: null, team_b_club: null }} currentUserId="me" />
  );

  await screen.findByText('CASUAL');
});
