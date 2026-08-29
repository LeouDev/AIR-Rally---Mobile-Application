import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { ResultPhase } from '@/components/ranked/match/result-phase';
import type { RankedMatch } from '@/lib/database.types';
import type { RankedMatchDetail, RankedMatchParticipant } from '@/lib/ranked';

/**
 * DisputedView's "All four players have been notified." was hardcoded
 * for doubles — wrong for a singles dispute, where only 2 people were
 * actually notified. Derived from match.players.length instead.
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
    match_type: 'singles',
    match_weight_type: 'air_rally_ranked',
    team_a_name: null,
    team_a_club_id: null,
    team_b_name: null,
    team_b_club_id: null,
    rated: true,
    status: 'disputed',
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
    rank_applied: false,
    dispute_reason: 'Score disagreement',
    created_by: 'me',
    created_at: '2026-08-20T00:00:00.000Z',
    started_at: '2026-08-20T00:00:00.000Z',
    completed_at: '2026-08-20T00:10:00.000Z',
    confirmed_at: null,
    updated_at: '2026-08-20T00:11:00.000Z',
    ...overrides,
  };
}

function participant(overrides: Partial<RankedMatchParticipant>): RankedMatchParticipant {
  return {
    match_id: 'match-1',
    user_id: 'me',
    team: 'a',
    is_host: true,
    mode: 'singles',
    ready: true,
    ready_at: null,
    officiating_vote: true,
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
    rank: null,
    ...overrides,
  };
}

describe('ResultPhase — DisputedView player count derived from match.players', () => {
  it('says "2 players" for a singles dispute', async () => {
    const match: RankedMatchDetail = {
      ...matchFixture(),
      players: [
        participant({ user_id: 'me', team: 'a' }),
        participant({ user_id: 'opp', team: 'b', profile: { id: 'opp', display_name: 'Robin', avatar_url: null } }),
      ],
      scorekeeper: null,
      team_a_club: null,
      team_b_club: null,
    };
    await render(<ResultPhase match={match} currentUserId="me" />);

    await screen.findByText('Result disputed');
    expect(screen.getByText(/All 2 players have been notified\./)).toBeTruthy();
  });

  it('says "4 players" for a doubles dispute', async () => {
    const match: RankedMatchDetail = {
      ...matchFixture({ match_type: 'doubles' }),
      players: [
        participant({ user_id: 'me', team: 'a' }),
        participant({ user_id: 'p2', team: 'a', is_host: false, profile: { id: 'p2', display_name: 'Sam', avatar_url: null } }),
        participant({ user_id: 'p3', team: 'b', is_host: false, profile: { id: 'p3', display_name: 'Robin', avatar_url: null } }),
        participant({ user_id: 'p4', team: 'b', is_host: false, profile: { id: 'p4', display_name: 'Jamie', avatar_url: null } }),
      ],
      scorekeeper: null,
      team_a_club: null,
      team_b_club: null,
    };
    await render(<ResultPhase match={match} currentUserId="me" />);

    await screen.findByText('Result disputed');
    expect(screen.getByText(/All 4 players have been notified\./)).toBeTruthy();
  });
});
