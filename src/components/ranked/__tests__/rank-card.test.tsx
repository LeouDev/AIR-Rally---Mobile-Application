import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { RankCard } from '@/components/ranked/rank-card';
import type { PlayerRank } from '@/lib/database.types';
import { getPlayerRank } from '@/lib/ranked';

/**
 * Singles and doubles used to be two independent PlayerRank rows,
 * fetched together and tie-broken by whichever had more calibration
 * progress. That's gone with the single-rating migration — one row,
 * one fetch. These pin the one-arg call (the migration dropped the
 * mode param entirely — a stray second arg would silently no-op
 * against a mock but genuinely break against the real RPC) and that
 * the three display states still resolve correctly from that one row.
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

describe('RankCard — single rating', () => {
  it('fetches the rank with a single arg — no mode', async () => {
    mockGetPlayerRank.mockResolvedValue(null);
    await render(<RankCard />);

    await screen.findByText('Try AIR/Rally Ranked');
    expect(mockGetPlayerRank).toHaveBeenCalledWith('me');
  });

  it('shows the CTA when the player has never opened Ranked', async () => {
    mockGetPlayerRank.mockResolvedValue(null);
    await render(<RankCard />);

    await screen.findByText('Try AIR/Rally Ranked');
  });

  it('shows calibration progress from the one row, uncalibrated', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 4 }));
    await render(<RankCard />);

    await screen.findByText('4 of 10 calibration matches played');
  });

  it('shows the placed rank once the one row is calibrated', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
    await render(<RankCard />);

    await screen.findByText('AIR/Rally Rank');
    expect(screen.getByText('Volleyer II')).toBeTruthy();
  });

  it('shows the numeric ARR alongside the tier once calibrated, formatted the same way as the leaderboard', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2, rating: 1099 }));
    await render(<RankCard />);

    await screen.findByText('AIR/Rally Rank');
    expect(screen.getByText('ARR 1,099')).toBeTruthy();
  });

  it('does NOT show a provisional ARR while still calibrating — the number stays hidden with the tier', async () => {
    // Load-bearing: the founder explicitly decided both the tier and the
    // number stay hidden until match 10, so a calibrating player must
    // never see a number here even though `rating` exists on the row
    // from day one.
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 4, rating: 1050 }));
    await render(<RankCard />);

    await screen.findByText('4 of 10 calibration matches played');
    expect(screen.queryByText(/ARR/)).toBeNull();
  });
});
