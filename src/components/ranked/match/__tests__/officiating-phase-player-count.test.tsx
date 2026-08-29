import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { OfficiatingPhase } from '@/components/ranked/match/officiating-phase';
import type { RankedMatch } from '@/lib/database.types';
import type { RankedMatchDetail, RankedMatchParticipant } from '@/lib/ranked';

/**
 * "One of the four players" / "All four players must approve." were
 * hardcoded for doubles — a singles match (2 players) showed the same
 * copy, which is simply wrong (there is no "one of four" in a 1v1).
 * Derived from match.players.length instead, so this pins both the
 * singles (2) and doubles (4) counts render correctly, not just that
 * doubles still works.
 */

jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  listRefereeCandidates: jest.fn(),
}));

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
    status: 'officiating',
    officiating_mode: null,
    scorekeeper_id: null,
    target_score: 11,
    win_by: 2,
    score_a: 0,
    score_b: 0,
    serving_team: 'a',
    scoring_mode: 'rally',
    server_number: null,
    first_service_turn_used: false,
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

function participant(overrides: Partial<RankedMatchParticipant>): RankedMatchParticipant {
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
    rating_discounted: false,
    created_at: '2026-08-20T00:00:00.000Z',
    profile: null,
    rank: null,
    ...overrides,
  };
}

function singlesDetail(overrides: Partial<RankedMatch> = {}): RankedMatchDetail {
  return {
    ...matchFixture(overrides),
    players: [
      participant({ user_id: 'me', team: 'a', is_host: true, profile: { id: 'me', display_name: 'Leou', avatar_url: null } }),
      participant({ user_id: 'opp', team: 'b', is_host: false, profile: { id: 'opp', display_name: 'Robin', avatar_url: null } }),
    ],
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  };
}

function doublesDetail(overrides: Partial<RankedMatch> = {}): RankedMatchDetail {
  return {
    ...matchFixture({ match_type: 'doubles', ...overrides }),
    players: [
      participant({ user_id: 'me', team: 'a', is_host: true, profile: { id: 'me', display_name: 'Leou', avatar_url: null } }),
      participant({ user_id: 'p2', team: 'a', is_host: false, profile: { id: 'p2', display_name: 'Sam', avatar_url: null } }),
      participant({ user_id: 'p3', team: 'b', is_host: false, profile: { id: 'p3', display_name: 'Robin', avatar_url: null } }),
      participant({ user_id: 'p4', team: 'b', is_host: false, profile: { id: 'p4', display_name: 'Jamie', avatar_url: null } }),
    ],
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  };
}

describe('OfficiatingPhase — player count derived from match.players, not a hardcoded four', () => {
  it('mode picker says "2 players" for a singles match', async () => {
    await render(<OfficiatingPhase match={singlesDetail()} currentUserId="me" />);

    await screen.findByText('Find referee');
    expect(screen.getByText('A non-playing person calls the score from courtside. All 2 players must approve.')).toBeTruthy();
    expect(screen.getByText('One of the 2 players manages the official score.')).toBeTruthy();
    expect(screen.queryByText(/four players/)).toBeNull();
  });

  it('mode picker says "4 players" for a doubles match', async () => {
    await render(<OfficiatingPhase match={doublesDetail()} currentUserId="me" />);

    await screen.findByText('Find referee');
    expect(screen.getByText('A non-playing person calls the score from courtside. All 4 players must approve.')).toBeTruthy();
    expect(screen.getByText('One of the 4 players manages the official score.')).toBeTruthy();
  });

  it('proposed scorekeeper caption says "2 players" for a singles match', async () => {
    const match = singlesDetail({ scorekeeper_id: 'me', officiating_mode: 'player_scorekeeper' });
    await render(<OfficiatingPhase match={match} currentUserId="me" />);

    await screen.findByText('One of the 2 players');
    expect(screen.queryByText(/four players/)).toBeNull();
  });

  it('proposed scorekeeper caption says "4 players" for a doubles match', async () => {
    const match = doublesDetail({ scorekeeper_id: 'me', officiating_mode: 'player_scorekeeper' });
    await render(<OfficiatingPhase match={match} currentUserId="me" />);

    await screen.findByText('One of the 4 players');
  });

  it('referee mode still says "Not in this match" regardless of player count', async () => {
    const match = singlesDetail({ scorekeeper_id: 'ref', officiating_mode: 'referee' });
    await render(<OfficiatingPhase match={match} currentUserId="me" />);

    await screen.findByText('Not in this match');
  });
});
