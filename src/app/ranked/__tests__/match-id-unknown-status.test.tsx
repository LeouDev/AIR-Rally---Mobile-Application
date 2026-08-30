import { render, screen } from '@testing-library/react-native';
import React from 'react';

import RankedMatchScreen from '@/app/ranked/[matchId]';
import type { RankedMatch } from '@/lib/database.types';
import { getMatch, type RankedMatchDetail } from '@/lib/ranked';
import { useRankedMatch } from '@/hooks/use-ranked-match';

/**
 * d0 nearly shipped a new ranked_matches.status value before catching
 * that this screen's own render switch has no default — an unrecognized
 * status returns undefined from the LiveMatch component, which React
 * throws on ("Nothing was returned from render"), not a missing label.
 * Pins that a status this build has never heard of renders SOMETHING
 * instead of crashing the whole match screen.
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ matchId: 'match-1' }),
  Stack: { Screen: () => null },
}));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getMatch: jest.fn(),
}));
jest.mock('@/hooks/use-ranked-match', () => ({ useRankedMatch: jest.fn() }));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));
jest.mock('@/components/report-action', () => ({ ReportAction: () => null }));

const mockGetMatch = getMatch as jest.MockedFunction<typeof getMatch>;
const mockUseRankedMatch = useRankedMatch as jest.MockedFunction<typeof useRankedMatch>;

function matchFixture(overrides: Partial<RankedMatch> = {}): RankedMatchDetail {
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
    status: 'expired' as never,
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
    players: [],
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('renders a fallback card instead of crashing on a status this build does not recognize', async () => {
  const fixture = matchFixture();
  mockGetMatch.mockResolvedValue(fixture);
  mockUseRankedMatch.mockReturnValue(fixture);

  await render(<RankedMatchScreen />);

  await screen.findByText("Can't show this match yet");
});
