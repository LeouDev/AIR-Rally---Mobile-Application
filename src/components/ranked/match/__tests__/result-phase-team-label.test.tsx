import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { ResultPhase } from '@/components/ranked/match/result-phase';
import type { RankedMatch } from '@/lib/database.types';
import type { RankedMatchDetail, RankedMatchParticipant } from '@/lib/ranked';

/**
 * The result screen is where a player sees who they just beat — this pins
 * that the WINNER line and the score-column captions resolve to the
 * team's chosen identity for doubles, and to the player's own name for
 * singles (never a custom team/club name) — matching live-scoreboard.tsx's
 * unconditional rendering of the same teamIdentityLabel() value, so a
 * singles player doesn't lose the opponent-identity caption they had
 * throughout the live match the moment the result screen appears.
 */

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn().mockResolvedValue('file:///x.png') }));
jest.mock('@/lib/share', () => ({ shareCard: jest.fn() }));

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

function participant(overrides: Partial<RankedMatchParticipant> = {}): RankedMatchParticipant {
  return {
    match_id: 'match-1',
    user_id: 'me',
    team: 'a',
    is_host: true,
    mode: 'doubles',
    ready: true,
    ready_at: null,
    officiating_vote: true,
    result_response: 'accepted',
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
    rank: null,
    ...overrides,
  };
}

function doublesDetail(match: RankedMatch): RankedMatchDetail {
  const me = participant();
  const partner = participant({ user_id: 'partner', profile: { id: 'partner', display_name: 'Sam', avatar_url: null } });
  const opp1 = participant({ user_id: 'opp-1', team: 'b', profile: { id: 'opp-1', display_name: 'Robin', avatar_url: null } });
  const opp2 = participant({ user_id: 'opp-2', team: 'b', profile: { id: 'opp-2', display_name: 'Alex', avatar_url: null } });
  return {
    ...match,
    players: [me, partner, opp1, opp2],
    scorekeeper: null,
    team_a_club: match.team_a_club_id ? { id: match.team_a_club_id, name: 'Rally Point' } : null,
    team_b_club: null,
  };
}

it('names the winning club, not "Team A", in the confirmed WINNER line', async () => {
  await render(<ResultPhase match={doublesDetail(matchFixture({ team_a_club_id: 'club-1' }))} currentUserId="me" />);

  await waitFor(() => expect(screen.getAllByText('Rally Point').length).toBeGreaterThan(0));
  expect(screen.queryByText('Team A')).toBeNull();
});

it('falls back to first names for an unnamed doubles team in the WINNER line', async () => {
  await render(<ResultPhase match={doublesDetail(matchFixture())} currentUserId="me" />);

  await waitFor(() => expect(screen.getAllByText('Leou · Sam').length).toBeGreaterThan(0));
});

it('shows the resolved team name below each score column for doubles', async () => {
  await render(<ResultPhase match={doublesDetail(matchFixture({ team_b_name: 'Net Ninjas' }))} currentUserId="me" />);

  await screen.findByText('Net Ninjas');
});

it('shows player names (never a custom team name) under each score column for singles', async () => {
  const match = { ...matchFixture({ match_type: 'singles', team_a_name: 'Should never show' }) };
  const me = participant({ mode: 'singles' });
  const opp = participant({ user_id: 'opp', team: 'b', mode: 'singles', profile: { id: 'opp', display_name: 'Robin', avatar_url: null } });
  const detail: RankedMatchDetail = { ...match, players: [me, opp], scorekeeper: null, team_a_club: null, team_b_club: null };

  await render(<ResultPhase match={detail} currentUserId="me" />);

  await waitFor(() => expect(screen.getAllByText('Leou').length).toBeGreaterThan(0));
  expect(screen.getByText('Robin')).toBeTruthy();
  expect(screen.queryByText('Should never show')).toBeNull();
});

it('names the winner in the awaiting-confirmation view too', async () => {
  const match = doublesDetail(matchFixture({ status: 'awaiting_confirmation', team_a_club_id: 'club-1' }));

  await render(<ResultPhase match={match} currentUserId="me" />);

  await screen.findByText(/Rally Point wins/);
});
