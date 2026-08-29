import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import PlayScreen from '@/app/(tabs)/play';
import type { RankedMatch } from '@/lib/database.types';
import type { RankedMatchDetail, RankedMatchParticipant } from '@/lib/ranked';
import { getActiveMatch } from '@/lib/ranked';
import { listMyEventStatuses, listUpcomingEvents } from '@/lib/events';

/**
 * getActiveMatch() — "the match a player should be dropped back into
 * when they reopen the app" — had zero callers before this. A player
 * who started a ranked match, got as far as choosing a scorekeeper,
 * then signed out and back in had no way back to it: games.tsx only
 * ever shows CONFIRMED results, and nothing else lists a match still
 * in progress. This is the founder's own reported repro, keyed off
 * their actual production row (status: officiating, both players
 * ready) rather than a lobby fixture that would have missed it.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(cb, [cb]);
  },
}));
jest.mock('@/lib/events', () => ({
  ...jest.requireActual('@/lib/events'),
  listUpcomingEvents: jest.fn(),
  listMyEventStatuses: jest.fn(),
}));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getActiveMatch: jest.fn(),
}));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

const mockList = listUpcomingEvents as jest.MockedFunction<typeof listUpcomingEvents>;
const mockStatuses = listMyEventStatuses as jest.MockedFunction<typeof listMyEventStatuses>;
const mockGetActiveMatch = getActiveMatch as jest.MockedFunction<typeof getActiveMatch>;
const mockPush = router.push as jest.MockedFunction<typeof router.push>;

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
    created_at: '2026-08-28T00:00:00.000Z',
    profile: null,
    rank: null,
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
    created_by: 'someone-else',
    created_at: '2026-08-28T00:00:00.000Z',
    started_at: null,
    completed_at: null,
    confirmed_at: null,
    updated_at: '2026-08-28T00:00:00.000Z',
    ...overrides,
  };
}

function detail(overrides: Partial<RankedMatch> = {}): RankedMatchDetail {
  const match = matchFixture(overrides);
  return {
    ...match,
    players: [
      participant({ user_id: 'me', team: 'b', is_host: false, profile: { id: 'me', display_name: 'Founder', avatar_url: null } }),
      participant({ user_id: 'other', team: 'a', is_host: true, profile: { id: 'other', display_name: 'Robin', avatar_url: null } }),
    ],
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockStatuses.mockResolvedValue(new Map());
});

it('offers a way back into an active match — the founder\'s own repro: officiating, both ready, not the creator', async () => {
  mockGetActiveMatch.mockResolvedValue(detail({ status: 'officiating' }));
  await render(<PlayScreen />);

  await screen.findByText('Match in progress');
  expect(screen.getByText('vs Robin')).toBeTruthy();
  expect(screen.getByText(/Choosing a scorekeeper/)).toBeTruthy();

  fireEvent.press(screen.getByText('Match in progress'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/ranked/[matchId]', params: { matchId: 'match-1' } });
});

it('does not show the card when there is no active match', async () => {
  mockGetActiveMatch.mockResolvedValue(null);
  await render(<PlayScreen />);

  await screen.findByLabelText('Start a game');
  expect(screen.queryByText('Match in progress')).toBeNull();
});

it('never lets a failed active-match lookup surface as the Open Play error, or vice versa', async () => {
  mockGetActiveMatch.mockRejectedValue(new Error('network'));
  await render(<PlayScreen />);

  await screen.findByLabelText('Start a game');
  expect(screen.queryByText('Match in progress')).toBeNull();
  expect(screen.queryByText(/Couldn't load games/)).toBeNull();
});

it.each([
  ['lobby', 'Waiting in the lobby'],
  ['officiating', 'Choosing a scorekeeper'],
  ['live', 'Live right now'],
  ['awaiting_confirmation', 'Waiting on the result'],
] as const)('labels a %s match as "%s"', async (status, label) => {
  mockGetActiveMatch.mockResolvedValue(detail({ status }));
  await render(<PlayScreen />);

  await screen.findByText(new RegExp(label));
});
