import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import RankedMatchScreen from '@/app/ranked/[matchId]';
import type { RankedMatch } from '@/lib/database.types';
import { getMatch } from '@/lib/ranked';

/**
 * The report entry point mounts in the header only once a real match has
 * loaded — before that there's no targetId to report, and the loading/
 * not-found states have nothing worth reporting. ReportAction itself is
 * mocked at the component boundary: its own behavior is already covered
 * by report-action.test.tsx, so this only pins WHEN [matchId].tsx offers
 * it and with which target.
 */

let capturedHeaderRight: (() => React.ReactNode) | undefined;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ matchId: 'match-1' }),
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) => {
      capturedHeaderRight = options.headerRight;
      return null;
    },
  },
}));

jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getMatch: jest.fn(),
}));

jest.mock('@/hooks/use-ranked-match', () => ({
  useRankedMatch: (_matchId: string, initial: unknown) => initial,
}));

jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

const mockReportAction = jest.fn();
jest.mock('@/components/report-action', () => ({
  ReportAction: (props: { targetType: string; targetId: string; targetLabel: string }) => {
    mockReportAction(props);
    const { Text } = jest.requireActual('react-native');
    return <Text>{`REPORT ACTION FOR ${props.targetId}`}</Text>;
  },
}));

const mockGetMatch = getMatch as jest.MockedFunction<typeof getMatch>;

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
    status: 'lobby',
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

beforeEach(() => {
  jest.clearAllMocks();
  capturedHeaderRight = undefined;
});

it('offers no header action while the match is still loading', async () => {
  mockGetMatch.mockReturnValue(new Promise(() => {})); // never resolves
  await render(<RankedMatchScreen />);

  expect(capturedHeaderRight).toBeUndefined();
});

it('offers no header action when the match failed to load', async () => {
  mockGetMatch.mockRejectedValue(new Error('not found'));
  await render(<RankedMatchScreen />);

  await waitFor(() => expect(screen.getByText('Match not found')).toBeTruthy());
  expect(capturedHeaderRight).toBeUndefined();
});

it('mounts ReportAction for this match once it has loaded', async () => {
  mockGetMatch.mockResolvedValue({
    ...matchFixture(),
    players: [],
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  } as never);
  await render(<RankedMatchScreen />);

  await waitFor(() => expect(capturedHeaderRight).toBeDefined());
  const headerElement = capturedHeaderRight?.();
  await render(<>{headerElement}</>);
  expect(screen.getByText('REPORT ACTION FOR match-1')).toBeTruthy();
  expect(mockReportAction).toHaveBeenCalledWith(
    expect.objectContaining({ targetType: 'ranked_match', targetId: 'match-1', targetLabel: 'match' })
  );
});
