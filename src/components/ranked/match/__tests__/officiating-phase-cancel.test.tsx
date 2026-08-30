import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import React from 'react';

import { OfficiatingPhase } from '@/components/ranked/match/officiating-phase';
import type { RankedMatch } from '@/lib/database.types';
import { cancelMatch, type RankedMatchDetail, type RankedMatchParticipant } from '@/lib/ranked';

/**
 * The RPC already allows cancelling from 'lobby', 'officiating', and
 * 'live' — the app just never offered it past the lobby screen. A
 * founder-reported match stuck in 'officiating' ("Choosing a
 * scorekeeper") had no way out. Added here, matching the lobby's
 * cancelMatch() call, but WITH a confirmation the lobby doesn't have —
 * by officiating, everyone has already readied up, so a stray tap
 * shouldn't silently end something four people agreed to.
 */

jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  listRefereeCandidates: jest.fn(),
  cancelMatch: jest.fn(),
}));

const mockCancelMatch = cancelMatch as jest.MockedFunction<typeof cancelMatch>;
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

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

function detail(overrides: Partial<RankedMatch> = {}): RankedMatchDetail {
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('OfficiatingPhase — cancel, mode view (no scorekeeper proposed yet)', () => {
  it('offers Cancel match to a participant', async () => {
    await render(<OfficiatingPhase match={detail()} currentUserId="me" />);

    await screen.findByText('Find referee');
    expect(screen.getByText('Cancel match')).toBeTruthy();
  });

  it('confirms before cancelling — tapping it does not call cancelMatch directly', async () => {
    await render(<OfficiatingPhase match={detail()} currentUserId="me" />);

    await screen.findByText('Find referee');
    fireEvent.press(screen.getByText('Cancel match'));

    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mockCancelMatch).not.toHaveBeenCalled();
    const [title] = mockAlert.mock.calls[0];
    expect(title).toBe('Cancel this match?');
  });

  it('calls cancelMatch only when the destructive confirm option is chosen', async () => {
    await render(<OfficiatingPhase match={detail()} currentUserId="me" />);

    await screen.findByText('Find referee');
    fireEvent.press(screen.getByText('Cancel match'));

    const buttons = mockAlert.mock.calls[0][2] as { text: string; style?: string; onPress?: () => void }[];
    const destructive = buttons.find((b) => b.style === 'destructive');
    expect(destructive?.text).toBe('Cancel match');
    destructive?.onPress?.();

    expect(mockCancelMatch).toHaveBeenCalledWith('match-1');
  });

  it('does not offer Cancel match to a non-participant viewer', async () => {
    await render(<OfficiatingPhase match={detail()} currentUserId="not-a-player" />);

    await screen.findByText('Find referee');
    expect(screen.queryByText('Cancel match')).toBeNull();
  });
});

describe('OfficiatingPhase — cancel, proposed view (scorekeeper picked, awaiting votes)', () => {
  it('offers Cancel match alongside Agree', async () => {
    const match = detail({ scorekeeper_id: 'me', officiating_mode: 'player_scorekeeper' });
    await render(<OfficiatingPhase match={match} currentUserId="me" />);

    await screen.findByText('Agree');
    expect(screen.getByText('Cancel match')).toBeTruthy();
  });

  it('confirms and cancels the same way as the mode view', async () => {
    const match = detail({ scorekeeper_id: 'me', officiating_mode: 'player_scorekeeper' });
    await render(<OfficiatingPhase match={match} currentUserId="me" />);

    await screen.findByText('Agree');
    fireEvent.press(screen.getByText('Cancel match'));

    const buttons = mockAlert.mock.calls[0][2] as { text: string; style?: string; onPress?: () => void }[];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();

    expect(mockCancelMatch).toHaveBeenCalledWith('match-1');
  });
});
