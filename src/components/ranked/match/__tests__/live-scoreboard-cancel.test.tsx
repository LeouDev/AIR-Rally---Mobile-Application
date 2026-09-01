import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import React from 'react';

import { LiveScoreboard } from '@/components/ranked/match/live-scoreboard';
import type { RankedMatch } from '@/lib/database.types';
import { cancelMatch, RankedError, type RankedMatchParticipant } from '@/lib/ranked';

/**
 * cancel_ranked_match() has always permitted cancelling from 'lobby',
 * 'officiating', or 'live', by any participant — 48add7e offered this
 * on the officiating screen but deliberately left the live scoreboard
 * alone, since walking out of a match already being scored is a
 * different act from cancelling one that never started. QA found a
 * real production match stuck 'live' with real rally data for 46+
 * hours — migration 114 deliberately exempts a live match with
 * recorded rallies from its stale-lobby sweep, so nothing else ever
 * recovers it. CTO settled the "is unilateral cancel correct here"
 * question — this test file only pins the UI/RPC-wiring shape, mirroring
 * officiating-phase-cancel.test.tsx.
 */

jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  recordPoint: jest.fn(),
  undoPoint: jest.fn(),
  submitResult: jest.fn(),
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
    status: 'live',
    officiating_mode: null,
    scorekeeper_id: 'me',
    target_score: 11,
    win_by: 2,
    score_a: 4,
    score_b: 3,
    serving_team: 'a',
    scoring_mode: 'rally',
    server_number: null,
    first_service_turn_used: false,
    winning_team: null,
    rank_applied: false,
    dispute_reason: null,
    created_by: 'me',
    created_at: '2026-08-28T00:00:00.000Z',
    started_at: '2026-08-28T00:05:00.000Z',
    completed_at: null,
    confirmed_at: null,
    updated_at: '2026-08-28T00:05:00.000Z',
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
    rating_discounted: false,
    created_at: '2026-08-28T00:00:00.000Z',
    profile: { id: 'me', display_name: 'Leou', avatar_url: null },
    rank: null,
    ...overrides,
  };
}

function detail(matchOverrides: Partial<RankedMatch> = {}) {
  const me = participant();
  const opp = participant({ user_id: 'opp', team: 'b', profile: { id: 'opp', display_name: 'Robin', avatar_url: null } });
  return { ...matchFixture(matchOverrides), players: [me, opp], scorekeeper: null, team_a_club: null, team_b_club: null };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCancelMatch.mockResolvedValue(undefined);
});

it('offers Cancel match to the scorekeeper', async () => {
  await render(<LiveScoreboard match={detail()} currentUserId="me" />);

  expect(screen.getByLabelText('Cancel match')).toBeTruthy();
});

it('offers Cancel match to a watcher, not just the scorekeeper', async () => {
  await render(<LiveScoreboard match={detail()} currentUserId="opp" />);

  await screen.findByText(/Watching live/);
  expect(screen.getByLabelText('Cancel match')).toBeTruthy();
});

it('does not offer Cancel match to a non-participant viewer', async () => {
  await render(<LiveScoreboard match={detail()} currentUserId="stranger" />);

  expect(screen.queryByLabelText('Cancel match')).toBeNull();
});

it('confirms before cancelling — tapping it does not call cancelMatch directly', async () => {
  await render(<LiveScoreboard match={detail()} currentUserId="me" />);

  fireEvent.press(screen.getByLabelText('Cancel match'));

  expect(mockAlert).toHaveBeenCalledTimes(1);
  expect(mockCancelMatch).not.toHaveBeenCalled();
  const [title] = mockAlert.mock.calls[0];
  expect(title).toBe('Cancel this match?');
});

it('calls cancelMatch only when the destructive confirm option is chosen', async () => {
  await render(<LiveScoreboard match={detail()} currentUserId="me" />);

  fireEvent.press(screen.getByLabelText('Cancel match'));
  const buttons = mockAlert.mock.calls[0][2] as { text: string; style?: string; onPress?: () => void }[];
  const destructive = buttons.find((b) => b.style === 'destructive');
  expect(destructive?.text).toBe('Cancel match');
  destructive?.onPress?.();

  expect(mockCancelMatch).toHaveBeenCalledWith('match-1');
});

it('surfaces the server\'s specific error when cancelling a match that already left a cancellable status', async () => {
  mockCancelMatch.mockRejectedValue(new RankedError('This match can no longer be cancelled.'));
  await render(<LiveScoreboard match={detail()} currentUserId="me" />);

  fireEvent.press(screen.getByLabelText('Cancel match'));
  const buttons = mockAlert.mock.calls[0][2] as { text: string; style?: string; onPress?: () => void }[];
  buttons.find((b) => b.style === 'destructive')?.onPress?.();

  await screen.findByText('This match can no longer be cancelled.');
});
