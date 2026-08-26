import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { LiveScoreboard } from '@/components/ranked/match/live-scoreboard';
import type { PlayerRank, RankedMatch } from '@/lib/database.types';
import type { RankedMatchParticipant } from '@/lib/ranked';

/**
 * The live scoreboard is the first place team identity actually shows to
 * players — this pins that a club-affiliated doubles team shows the club
 * name, an unnamed doubles team still falls back to first names (nobody
 * chose an identity yet), and singles never shows a team name even if one
 * somehow ended up set on the row (the founder's rule, keyed on match type).
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
    mode: 'singles',
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
    score_a: 3,
    score_b: 5,
    serving_team: 'a',
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

it('shows the club name for a doubles team affiliated with a club', async () => {
  const teamA = [participant(), participant({ user_id: 'partner', profile: { id: 'partner', display_name: 'Sam', avatar_url: null } })];
  const teamB = [
    participant({ user_id: 'opp-1', team: 'b', profile: { id: 'opp-1', display_name: 'Robin', avatar_url: null } }),
    participant({ user_id: 'opp-2', team: 'b', profile: { id: 'opp-2', display_name: 'Alex', avatar_url: null } }),
  ];
  const match = {
    ...matchFixture({ team_a_club_id: 'club-1' }),
    players: [...teamA, ...teamB],
    scorekeeper: null,
    team_a_club: { id: 'club-1', name: 'Rally Point' },
    team_b_club: null,
  };

  await render(<LiveScoreboard match={match} currentUserId="someone-else" />);

  expect(screen.getByText('Rally Point')).toBeTruthy();
});

it('falls back to first names for an unnamed doubles team', async () => {
  const teamA = [participant(), participant({ user_id: 'partner', profile: { id: 'partner', display_name: 'Sam', avatar_url: null } })];
  const teamB = [
    participant({ user_id: 'opp-1', team: 'b', profile: { id: 'opp-1', display_name: 'Robin', avatar_url: null } }),
    participant({ user_id: 'opp-2', team: 'b', profile: { id: 'opp-2', display_name: 'Alex', avatar_url: null } }),
  ];
  const match = {
    ...matchFixture(),
    players: [...teamA, ...teamB],
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  };

  await render(<LiveScoreboard match={match} currentUserId="someone-else" />);

  expect(screen.getByText('Leou · Sam')).toBeTruthy();
  expect(screen.getByText('Robin · Alex')).toBeTruthy();
});

it('shows the player name for singles even if a team name is somehow set on the row', async () => {
  const me = participant();
  const opp = participant({ user_id: 'opp', team: 'b', profile: { id: 'opp', display_name: 'Robin', avatar_url: null } });
  const match = {
    ...matchFixture({ match_type: 'singles', team_a_name: 'Should never show' }),
    players: [me, opp],
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  };

  await render(<LiveScoreboard match={match} currentUserId="someone-else" />);

  expect(screen.getByText('Leou')).toBeTruthy();
  expect(screen.queryByText('Should never show')).toBeNull();
});
