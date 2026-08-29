import { render, screen } from '@testing-library/react-native';
import React from 'react';

import PlayRankedScreen from '@/app/ranked/play';
import { Colors } from '@/constants/theme';
import type { PlayerRank } from '@/lib/database.types';
import { getPublicProfile } from '@/lib/follows';
import { getPlayerRank } from '@/lib/ranked';

/**
 * Founder-requested: the calibrating card on the Play doorway should
 * carry the same navy surface rank-card.tsx uses for its own
 * calibrating state — only that state, on this screen. Its own file
 * (rather than folded into play-calibration-card.test.tsx) because it
 * mocks CalibrationStatus to capture the `surface` prop directly — the
 * prop that's easy to pass silently wrong, since a background-only
 * change still renders a card, just with the unfilled progress
 * segments invisible against navy. Pinning "the card renders" would
 * not catch that; pinning `surface="navy"` does.
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

jest.mock('@/lib/profile', () => ({
  getUnbookedPlayAcknowledged: jest.fn().mockResolvedValue(false),
  acknowledgeUnbookedPlay: jest.fn(),
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

let capturedSurface: string | undefined;

jest.mock('@/components/ranked/calibration-status', () => ({
  CalibrationStatus: ({ surface }: { surface?: string }) => {
    capturedSurface = surface;
    const { Text } = jest.requireActual('react-native');
    return <Text>CALIBRATION_STATUS</Text>;
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
  capturedSurface = undefined;
  mockGetPublicProfile.mockResolvedValue(ME);
});

it('passes surface="navy" to CalibrationStatus while still calibrating', async () => {
  mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 3 }));
  const view = await render(<PlayRankedScreen />);

  await screen.findByText('CALIBRATION_STATUS');
  expect(capturedSurface).toBe('navy');

  // The container itself, not just the child prop — both need to
  // agree, or the card background and the track's fill/empty colors
  // would silently disagree with each other.
  const tree = JSON.stringify(view.toJSON());
  expect(tree).toContain(Colors.light.navy);
});

it('does NOT use the navy surface once calibrated — that branch is unchanged', async () => {
  mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
  await render(<PlayRankedScreen />);

  await screen.findByText('CALIBRATION_STATUS');
  expect(capturedSurface).toBe('default');
});

it('does NOT use the navy surface in Casual mode', async () => {
  // Casual mode doesn't render CalibrationStatus at all — confirms the
  // navy treatment stays scoped to Ranked's calibrating branch, not
  // "whatever's selected when not yet calibrated".
  mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 3 }));
  await render(<PlayRankedScreen />);
  await screen.findByText('CALIBRATION_STATUS');

  const casualTab = await screen.findByRole('button', { name: 'Casual' });
  const { fireEvent } = jest.requireActual('@testing-library/react-native');
  fireEvent.press(casualTab);

  await screen.findByText('CASUAL');
  expect(screen.queryByText('CALIBRATION_STATUS')).toBeNull();
});
