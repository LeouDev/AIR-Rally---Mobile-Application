import { act, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { RankCard } from '@/components/ranked/rank-card';
import type { PlayerRank } from '@/lib/database.types';
import { getPlayerRank } from '@/lib/ranked';

/**
 * The founder played and confirmed their first ranked match (a loss,
 * calibration_matches 0 -> 1 in production), then went back to the
 * Profile tab and still saw "0 of 10 calibration matches played."
 *
 * RankCard is a NativeTabs tab child — iOS keeps it alive when you
 * switch tabs, it never unmounts. Its rank fetch used to run in a plain
 * useEffect keyed on `userId`, which only fires once per mount. Once a
 * player opened Profile a single time this session, the card never
 * looked again, no matter how many matches they went on to play.
 *
 * This can't be caught by mounting the component once — that's exactly
 * the case that already passed. It has to simulate the tab regaining
 * focus a second time, WITHOUT unmounting, and assert the number
 * actually changes.
 */

let focusCallback: (() => void) | undefined;

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const ReactActual = jest.requireActual('react');
    focusCallback = cb;
    ReactActual.useEffect(cb, []);
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
  focusCallback = undefined;
});

it('re-fetches the rank when the tab regains focus, without unmounting', async () => {
  mockGetPlayerRank.mockResolvedValueOnce(rankFixture({ calibration_matches: 0, is_calibrated: false }));
  await render(<RankCard />);

  await screen.findByText('0 of 10 calibration matches played');
  expect(mockGetPlayerRank).toHaveBeenCalledTimes(1);
  expect(focusCallback).toBeDefined();

  // The founder plays and confirms a match on a different screen — the
  // Profile tab (and this card) never unmounts underneath them, so the
  // only way stale data gets replaced is a second fetch when the tab
  // regains focus.
  mockGetPlayerRank.mockResolvedValueOnce(rankFixture({ calibration_matches: 1, is_calibrated: false }));
  await act(async () => {
    focusCallback?.();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockGetPlayerRank).toHaveBeenCalledTimes(2);
  await waitFor(() => screen.getByText('1 of 10 calibration matches played'));
  expect(screen.queryByText('0 of 10 calibration matches played')).toBeNull();
});
