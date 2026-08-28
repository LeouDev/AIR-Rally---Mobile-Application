import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { LiveScoreboard } from '@/components/ranked/match/live-scoreboard';
import type { RankedMatch } from '@/lib/database.types';
import { recordPoint } from '@/lib/ranked';
import type { RankedMatchParticipant } from '@/lib/ranked';

/**
 * Founder's report, first live-scored match: tapping any one of the four
 * scoring buttons made all four visibly react, with no way to tell which
 * one had actually registered. The double-tap guard itself (one RPC in
 * flight at a time) is correct and stays — only the FEEDBACK was wrong:
 * every button shared one `busy` boolean and Button dims equally on
 * `disabled` regardless of which button caused it. These pin that only
 * the pressed button reports itself busy (Button's own accessibilityState
 * distinguishes "busy" — has a spinner — from plain "disabled") while the
 * guard still blocks the other three from being pressed at all.
 */

jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  recordPoint: jest.fn(),
  undoPoint: jest.fn(),
  submitResult: jest.fn(),
}));

const mockRecordPoint = recordPoint as jest.MockedFunction<typeof recordPoint>;

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
    score_a: 6,
    score_b: 6,
    serving_team: 'a',
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
    created_at: '2026-08-28T00:00:00.000Z',
    profile: { id: 'me', display_name: 'Leou', avatar_url: null },
    rank: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('only the pressed button reports itself busy — the other three are disabled but not loading', async () => {
  let resolveRecordPoint: () => void = () => {};
  mockRecordPoint.mockReturnValue(new Promise<void>((resolve) => (resolveRecordPoint = resolve)));

  const me = participant();
  const opp = participant({ user_id: 'opp', team: 'b', profile: { id: 'opp', display_name: 'Robin', avatar_url: null } });
  const match = { ...matchFixture(), players: [me, opp], scorekeeper: null, team_a_club: null, team_b_club: null };

  await render(<LiveScoreboard match={match} currentUserId="me" />);

  await fireEvent.press(screen.getByLabelText('+ Point team A'));

  const pointA = screen.getByLabelText('+ Point team A');
  const pointB = screen.getByLabelText('+ Point team B');
  const undo = screen.getByLabelText('Undo');
  const submit = screen.getByLabelText('Submit final');

  // The pressed button is genuinely busy (spinner) — the others are
  // merely disabled, which is the visible difference a scorekeeper needs.
  expect(pointA.props.accessibilityState.busy).toBe(true);
  expect(pointB.props.accessibilityState.busy).toBeFalsy();
  expect(undo.props.accessibilityState.busy).toBeFalsy();
  expect(submit.props.accessibilityState.busy).toBeFalsy();

  // The guard itself is untouched: all three others are still blocked
  // from firing a second RPC while the first is in flight.
  expect(pointB.props.accessibilityState.disabled).toBe(true);
  expect(undo.props.accessibilityState.disabled).toBe(true);
  expect(submit.props.accessibilityState.disabled).toBe(true);

  await act(async () => {
    resolveRecordPoint();
  });
});
