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
 *
 * Reported a SECOND time after this looked fixed: the first fix only
 * scoped `loading` (the spinner) to the pressed button — it never scoped
 * the DIMMED STYLE, which Button derives from `disabled || loading`
 * app-wide, and every button here shares `disabled={busy}`. So the
 * spinner was right but all four still visually dimmed together, which
 * from the founder's side is indistinguishable from the original bug.
 * The test above never caught this because it only asserted
 * accessibilityState (the functional props) — never the actual style
 * array, which is the one thing that would have failed against the
 * half-fixed version. The style-checking tests below are what's new.
 */

/** True if the flattened style array (Pressable's function-style prop
 * resolves to one, mixed with `false` for falsy conditional entries)
 * contains the dimmed-look object Button applies via `showDisabledStyle
 * && styles.disabled`. This is the assertion the original fix's test
 * suite never had — accessibilityState.disabled being true is correct
 * and expected for the blocked-but-not-visually-dimmed buttons, so
 * that alone can't tell a fixed render from a half-fixed one. */
function looksDimmed(element: { props: { style?: unknown } }): boolean {
  const flat = (Array.isArray(element.props.style) ? element.props.style : [element.props.style]).flat(Infinity);
  return flat.some((s) => typeof s === 'object' && s !== null && (s as { opacity?: number }).opacity === 0.5);
}

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

  await fireEvent.press(screen.getByLabelText('Team A won the rally'));

  const pointA = screen.getByLabelText('Team A won the rally');
  const pointB = screen.getByLabelText('Team B won the rally');
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

  // The actual second report: pointB and Undo (6-6, so Undo has no
  // reason of its own to look unavailable) must NOT visually dim just
  // because pointA's RPC is in flight — functionally blocked, not
  // visually touched. Submit SHOULD still look dimmed here, but for its
  // OWN reason (the game isn't finished at 6-6), independent of busy.
  expect(looksDimmed(pointB)).toBe(false);
  expect(looksDimmed(undo)).toBe(false);
  expect(looksDimmed(submit)).toBe(true);

  await act(async () => {
    resolveRecordPoint();
  });
});

it('Undo still looks dimmed at 0-0 even while nothing is busy — its own condition, not the shared guard', async () => {
  const me = participant();
  const opp = participant({ user_id: 'opp', team: 'b', profile: { id: 'opp', display_name: 'Robin', avatar_url: null } });
  const match = {
    ...matchFixture({ score_a: 0, score_b: 0 }),
    players: [me, opp],
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  };

  await render(<LiveScoreboard match={match} currentUserId="me" />);

  expect(looksDimmed(screen.getByLabelText('Undo'))).toBe(true);
  // Nothing is busy here — pointA/pointB have no reason of their own to
  // be unavailable, so they read as normal, pressable buttons.
  expect(looksDimmed(screen.getByLabelText('Team A won the rally'))).toBe(false);
  expect(looksDimmed(screen.getByLabelText('Team B won the rally'))).toBe(false);
});
