import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import PlayRankedScreen from '@/app/ranked/play';
import { Colors } from '@/constants/theme';
import type { PlayerRank } from '@/lib/database.types';
import { getPublicProfile } from '@/lib/follows';
import { getPlayerRank } from '@/lib/ranked';

/**
 * That slot under the Game type toggle holds three different things —
 * Casual, Ranked-calibrating, Ranked-calibrated — and the founder's
 * ask was explicitly about consistency ACROSS the toggle ("whenever I
 * toggle from casual to rank it has the same style"), not about any
 * one of the three in isolation. All three get the same navy card
 * now. Mocks RankBadge specifically (rather than CalibrationStatus, as
 * the first pass here did) so this exercises the real prop-threading
 * from play.tsx through CalibrationStatus into the one piece that
 * doesn't degrade gracefully if missed — RankBadge's `on` prop picks a
 * DIFFERENT ink-swapped asset, not a tint, so a light-surface badge on
 * a navy card won't just look slightly off, it'll be the wrong image.
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

jest.mock('@/components/ranked/ranked-direct-invite', () => ({
  RankedDirectInvite: () => {
    const { View } = jest.requireActual('react-native');
    return <View />;
  },
}));

let capturedBadgeOn: string | undefined;

jest.mock('@/components/ranked/rank-badge', () => ({
  RankBadge: ({ on }: { on?: string }) => {
    capturedBadgeOn = on;
    const { Text } = jest.requireActual('react-native');
    return <Text>RANK_BADGE</Text>;
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
  capturedBadgeOn = undefined;
  mockGetPublicProfile.mockResolvedValue(ME);
});

it('Casual renders on the navy card', async () => {
  mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 3 }));
  const view = await render(<PlayRankedScreen />);

  const casualTab = await screen.findByRole('button', { name: 'Casual' });
  fireEvent.press(casualTab);
  await screen.findByText('CASUAL');

  const tree = JSON.stringify(view.toJSON());
  expect(tree).toContain(Colors.light.navy);
});

it('Ranked-calibrating renders on the navy card', async () => {
  mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 3 }));
  const view = await render(<PlayRankedScreen />);

  await screen.findByText('3 of 10 calibration matches played');
  const tree = JSON.stringify(view.toJSON());
  expect(tree).toContain(Colors.light.navy);
});

it('Ranked-calibrated renders on the navy card, and the tier badge uses the navy-ink asset', async () => {
  mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
  const view = await render(<PlayRankedScreen />);

  await screen.findByText('RANK_BADGE');
  expect(capturedBadgeOn).toBe('navy');

  const tree = JSON.stringify(view.toJSON());
  expect(tree).toContain(Colors.light.navy);
});

it('renders no badge at all while still calibrating — confirms the mock isn\'t just always capturing "navy"', async () => {
  mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 3 }));
  await render(<PlayRankedScreen />);
  await screen.findByText('3 of 10 calibration matches played');

  expect(screen.queryByText('RANK_BADGE')).toBeNull();
  expect(capturedBadgeOn).toBeUndefined();
});
