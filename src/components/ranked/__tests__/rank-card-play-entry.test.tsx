import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { RankCard } from '@/components/ranked/rank-card';
import type { PlayerRank } from '@/lib/database.types';
import { getPlayerRank } from '@/lib/ranked';

/**
 * The booking-free doorway is only useful if a player without any
 * bookings can actually find it. Pins that all three of RankCard's
 * states — never opened Ranked, still calibrating, already placed —
 * offer a "Play a game" entry routing to /ranked/play, not just the
 * leaderboard link that existed before.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(cb, [cb]);
  },
}));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getPlayerRank: jest.fn(),
}));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

const mockGetPlayerRank = getPlayerRank as jest.MockedFunction<typeof getPlayerRank>;
const mockPush = router.push as jest.MockedFunction<typeof router.push>;

function rankFixture(overrides: Partial<PlayerRank>): PlayerRank {
  return {
    season_id: 1,
    user_id: 'me',
    rating: 1000,
    tier: 1,
    pips: 1,
    reliability: 0,
    sandbag_risk_score: 0,
    last_match_at: null,
    in_promotion_series: false,
    star_protection: 0,
    calibration_matches: 0,
    is_calibrated: false,
    wins: 0,
    losses: 0,
    current_streak: 0,
    best_streak: 0,
    best_tier: null,
    best_pips: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('offers "Play a game" for a player who has never opened Ranked', async () => {
  mockGetPlayerRank.mockResolvedValue(null);
  await render(<RankCard />);

  const play = await screen.findByText('Play a game');
  fireEvent.press(play);
  expect(mockPush).toHaveBeenCalledWith('/ranked/play');
});

it('offers "Play a game" while still calibrating', async () => {
  mockGetPlayerRank.mockResolvedValue(rankFixture({ calibration_matches: 4, is_calibrated: false }));
  await render(<RankCard />);

  const play = await screen.findByText('Play a game');
  fireEvent.press(play);
  expect(mockPush).toHaveBeenCalledWith('/ranked/play');
});

it('offers "Play a game" once calibrated and placed', async () => {
  mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
  await render(<RankCard />);

  const play = await screen.findByText('Play a game');
  fireEvent.press(play);
  expect(mockPush).toHaveBeenCalledWith('/ranked/play');
});
