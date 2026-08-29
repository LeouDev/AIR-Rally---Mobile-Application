import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { RankCard } from '@/components/ranked/rank-card';
import type { PlayerRank } from '@/lib/database.types';
import { getPlayerRank } from '@/lib/ranked';

/**
 * Two things from the same founder report: the button read "Leaderboard"
 * and didn't fit as a third of the action row (broke mid-word: "Leaderboa"
 * / "rd"). The founder chose "Ladder" as the rename, which resolves the
 * fit at today's measurements — but can't be seen rendering in this
 * session (no working simulator), so this also pins the defensive
 * numberOfLines/adjustsFontSizeToFit added to every action-button label,
 * not just the one that broke: Dynamic Type can push a short label past
 * its slot too, at a scale nobody measured by hand.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getPlayerRank: jest.fn(),
}));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

const mockGetPlayerRank = getPlayerRank as jest.MockedFunction<typeof getPlayerRank>;

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

it('reads "Ladder", not "Leaderboard", for a player who has never opened Ranked', async () => {
  mockGetPlayerRank.mockResolvedValue(null);
  await render(<RankCard />);

  await screen.findByText('Ladder');
  expect(screen.queryByText('Leaderboard')).toBeNull();
});

it('reads "Ladder" once calibrated and placed, in the three-button row that actually broke', async () => {
  mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
  await render(<RankCard />);

  const ladder = await screen.findByText('Ladder');
  expect(screen.queryByText('Leaderboard')).toBeNull();

  // Pins the layout fix itself, not just the rename — can't see the
  // row render, so this is the evidence that a still-too-long label
  // would shrink instead of breaking mid-word.
  expect(ladder.props.numberOfLines).toBe(1);
  expect(ladder.props.adjustsFontSizeToFit).toBe(true);

  const playAGame = await screen.findByText('Play a game');
  expect(playAGame.props.numberOfLines).toBe(1);
  expect(playAGame.props.adjustsFontSizeToFit).toBe(true);

  const myGames = await screen.findByText('My games');
  expect(myGames.props.numberOfLines).toBe(1);
  expect(myGames.props.adjustsFontSizeToFit).toBe(true);
});

it('the calibrating branch\'s solo "Play a game" button also gets the defensive treatment', async () => {
  mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 4 }));
  await render(<RankCard />);

  const playAGame = await screen.findByText('Play a game');
  expect(playAGame.props.numberOfLines).toBe(1);
  expect(playAGame.props.adjustsFontSizeToFit).toBe(true);
});
