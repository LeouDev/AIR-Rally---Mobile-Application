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
 *
 * Once calibrated, this screen also has to say that migration 100 freezes
 * their rating outside a booked court (still no booking exists here by
 * construction), and it offers VenueRequestForm's `rankedBlocked` variant
 * as the one thing the player can actually do about it — the single
 * highest-intent moment to capture a venue request, since they're blocked
 * specifically by not having one.
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

jest.mock('@/components/venue-request-form', () => ({
  VenueRequestForm: ({ userId, variant }: { userId: string; variant: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`venue-request-form:${userId}:${variant}`}</Text>;
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

  it('once calibrated, warns that rating is frozen outside a booked court', async () => {
    // This screen hardcodes booked: false, and migration 100 freezes
    // rating (no change, no win, no loss, no streak) outside a booked
    // court — this notice would otherwise silently vanish behind the
    // new rank/ARR display.
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
    await render(<PlayRankedScreen />);

    await screen.findByText(/your rating only moves in matches on a court booked through AIR\/Rally/);
  });

  it('does not show the booked-court notice while still calibrating', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 3 }));
    await render(<PlayRankedScreen />);

    await screen.findByText('3 of 10 calibration matches played');
    expect(screen.queryByText(/court booked through AIR\/Rally/)).toBeNull();
  });

  it('once calibrated, offers the venue-request form as the way to close that gap', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
    await render(<PlayRankedScreen />);

    await screen.findByText('venue-request-form:me:rankedBlocked');
  });

  it('does not offer the venue-request form while still calibrating', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 3 }));
    await render(<PlayRankedScreen />);

    await screen.findByText('3 of 10 calibration matches played');
    expect(screen.queryByText(/venue-request-form:/)).toBeNull();
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
