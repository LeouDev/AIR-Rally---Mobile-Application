import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { LiveScoreboard } from '@/components/ranked/match/live-scoreboard';
import type { PlayerRank, RankedMatch } from '@/lib/database.types';
import type { RankedMatchParticipant } from '@/lib/ranked';

/**
 * The three-number call — "0-0-2" — on the live court line, for doubles
 * side-out matches only. d0's own catch, pinned here: the first two
 * numbers are serving-then-receiving, not team-A-then-team-B, so this
 * specifically covers serving_team: 'b' — a fixture that only ever had
 * A serving would pass a backwards implementation too.
 */

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
    mode: 'doubles',
    ready: true,
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
    rating_discounted: false,
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
    match_type: 'doubles',
    match_weight_type: 'air_rally_ranked',
    team_a_name: null,
    team_a_club_id: null,
    team_b_name: null,
    team_b_club_id: null,
    rated: true,
    status: 'live',
    officiating_mode: null,
    scorekeeper_id: null,
    target_score: 11,
    win_by: 2,
    score_a: 5,
    score_b: 3,
    serving_team: 'a',
    scoring_mode: 'side_out',
    server_number: 1,
    first_service_turn_used: true,
    winning_team: null,
    rank_applied: false,
    dispute_reason: null,
    created_by: 'me',
    created_at: '2026-08-20T00:00:00.000Z',
    started_at: '2026-08-20T00:05:00.000Z',
    completed_at: null,
    confirmed_at: null,
    updated_at: '2026-08-20T00:05:00.000Z',
    ...overrides,
  };
}

function doublesPlayers() {
  return [
    participant(),
    participant({ user_id: 'partner', profile: { id: 'partner', display_name: 'Sam', avatar_url: null } }),
    participant({ user_id: 'opp-1', team: 'b', profile: { id: 'opp-1', display_name: 'Robin', avatar_url: null } }),
    participant({ user_id: 'opp-2', team: 'b', profile: { id: 'opp-2', display_name: 'Alex', avatar_url: null } }),
  ];
}

it('shows the call with serving score first when team A is serving', async () => {
  const match = {
    ...matchFixture({ serving_team: 'a', score_a: 5, score_b: 3 }),
    players: doublesPlayers(),
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  };

  await render(<LiveScoreboard match={match} currentUserId="someone-else" />);

  expect(screen.getByText(/5-3-1/)).toBeTruthy();
});

it('shows the call with serving score first when team B is serving — not score_a first', async () => {
  const match = {
    ...matchFixture({ serving_team: 'b', score_a: 5, score_b: 3 }),
    players: doublesPlayers(),
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  };

  await render(<LiveScoreboard match={match} currentUserId="someone-else" />);

  expect(screen.getByText(/3-5-1/)).toBeTruthy();
  expect(screen.queryByText(/5-3-1/)).toBeNull();
});

it('calls the opening turn "2" on a fresh live match with a null server_number', async () => {
  const match = {
    ...matchFixture({ serving_team: 'a', score_a: 0, score_b: 0, server_number: null, first_service_turn_used: false }),
    players: doublesPlayers(),
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  };

  await render(<LiveScoreboard match={match} currentUserId="someone-else" />);

  expect(screen.getByText(/0-0-2/)).toBeTruthy();
});

it('does not show a called-server number for rally-scored matches', async () => {
  const match = {
    ...matchFixture({ scoring_mode: 'rally', server_number: null, first_service_turn_used: false }),
    players: doublesPlayers(),
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  };

  await render(<LiveScoreboard match={match} currentUserId="someone-else" />);

  await screen.findByText(/SERVING: TEAM A/);
  expect(screen.queryByText(/·.*-.*-/)).toBeNull();
});

it('does not show a called-server number for singles', async () => {
  const me = participant({ mode: 'singles' });
  const opp = participant({ user_id: 'opp', team: 'b', mode: 'singles', profile: { id: 'opp', display_name: 'Robin', avatar_url: null } });
  const match = {
    ...matchFixture({ match_type: 'singles', scoring_mode: 'side_out', server_number: null, first_service_turn_used: false }),
    players: [me, opp],
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  };

  await render(<LiveScoreboard match={match} currentUserId="someone-else" />);

  await screen.findByText(/SERVING: TEAM A/);
  expect(screen.queryByText(/·.*-.*-/)).toBeNull();
});
