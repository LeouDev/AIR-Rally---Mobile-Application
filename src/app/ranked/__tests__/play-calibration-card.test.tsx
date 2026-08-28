import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import PlayRankedScreen from '@/app/ranked/play';
import type { PlayerRank } from '@/lib/database.types';
import { getPublicProfile } from '@/lib/follows';
import { getPlayerRank } from '@/lib/ranked';

/**
 * The Ranked-mode explainer used to always show the fixed "counts toward
 * your 10 calibration matches" string, whether or not the player had
 * already finished calibration — a claim that was simply wrong once
 * `is_calibrated` flipped true. It now reuses rank-card.tsx's own
 * CalibrationStatus component so the same fact can't drift between the
 * two screens. The calibrated branch couldn't be seen on this screen
 * before today (rankedStakes() always took the !isCalibrated path here),
 * so it's pinned explicitly below rather than assumed correct by reuse.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock('@/lib/follows', () => ({ getPublicProfile: jest.fn() }));

jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getPlayerRank: jest.fn(),
}));

jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

jest.mock('@/components/ranked/ranked-party-builder', () => ({
  RankedPartyBuilder: () => {
    const { View } = jest.requireActual('react-native');
    return <View />;
  },
}));

const mockGetPublicProfile = getPublicProfile as jest.MockedFunction<typeof getPublicProfile>;
const mockGetPlayerRank = getPlayerRank as jest.MockedFunction<typeof getPlayerRank>;
const ME = { id: 'me', display_name: 'Galileouuu', avatar_url: null };

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
  mockGetPublicProfile.mockResolvedValue(ME);
});

describe('PlayRankedScreen — Ranked-mode explainer', () => {
  it('shows calibration progress in place of the old fixed 10-matches string', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 3 }));
    await render(<PlayRankedScreen />);

    await screen.findByText('3 of 10 calibration matches played');
    expect(screen.queryByText(/no booking needed for this part/)).toBeNull();
  });

  it('shows progress at 0 of 10 for a player who has never played Ranked', async () => {
    mockGetPlayerRank.mockResolvedValue(null);
    await render(<PlayRankedScreen />);

    await screen.findByText('0 of 10 calibration matches played');
  });

  it('once calibrated, shows the placed rank and ARR instead of "10 of 10"', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2, rating: 1099 }));
    await render(<PlayRankedScreen />);

    await screen.findByText('AIR/Rally Rank');
    expect(screen.getByText('ARR 1,099')).toBeTruthy();
    expect(screen.queryByText(/calibration matches played/)).toBeNull();
  });

  it('still warns a calibrated player that this booking-free screen will not move their rating', async () => {
    // This screen hardcodes booked: false, so rankedStakes()'s warning
    // for a calibrated-but-unbooked match still applies here and would
    // otherwise silently vanish behind the new rank/ARR display.
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
    await render(<PlayRankedScreen />);

    await screen.findByText(/won't move/);
  });

  it('does not show that unbooked-match warning while still calibrating', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 3 }));
    await render(<PlayRankedScreen />);

    await screen.findByText('3 of 10 calibration matches played');
    expect(screen.queryByText(/won't move/)).toBeNull();
  });

  it('leaves Casual mode entirely untouched', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 3 }));
    await render(<PlayRankedScreen />);

    const casualTab = await screen.findByRole('button', { name: 'Casual' });
    fireEvent.press(casualTab);

    await screen.findByText('CASUAL');
    expect(screen.getByText("Wins and losses are recorded, but nothing here affects your rating.")).toBeTruthy();
    expect(screen.queryByText(/calibration matches played/)).toBeNull();
  });
});
