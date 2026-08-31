import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import PlayRankedScreen from '@/app/ranked/play';
import type { PlayerRank } from '@/lib/database.types';
import { getPublicProfile } from '@/lib/follows';
import { acknowledgeUnbookedPlay, getUnbookedPlayAcknowledged } from '@/lib/profile';
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
 * Once calibrated, this screen also has to say that migration 100
 * freezes their rating outside a booked court (still no booking exists
 * here by construction) — as a compact tappable line on the screen, and
 * as a "Find match" gate the first time via RatingFreezeSheet's confirm
 * mode (RankedDirectInvite's `confirmBeforeCreate`, since the surgery
 * that removed the singles/doubles toggle replaced RankedPartyBuilder
 * with RankedDirectInvite here). Both are pinned here: the line's
 * copy/visibility, and that the confirm hook only reaches
 * RankedDirectInvite for a calibrated Ranked-mode player.
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
  getUnbookedPlayAcknowledged: jest.fn(),
  acknowledgeUnbookedPlay: jest.fn(),
}));

jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

let capturedConfirmBeforeCreate: (() => Promise<boolean>) | undefined;

jest.mock('@/components/ranked/ranked-direct-invite', () => ({
  RankedDirectInvite: ({ confirmBeforeCreate }: { confirmBeforeCreate?: () => Promise<boolean> }) => {
    capturedConfirmBeforeCreate = confirmBeforeCreate;
    const { View } = jest.requireActual('react-native');
    return <View />;
  },
}));

jest.mock('@/components/ranked/rating-freeze-sheet', () => ({
  RatingFreezeSheet: ({
    visible,
    onClose,
    onConfirm,
    userId,
  }: {
    visible: boolean;
    onClose: () => void;
    onConfirm?: () => void;
    userId: string;
  }) => {
    const { Pressable, Text, View } = jest.requireActual('react-native');
    if (!visible) return null;
    return (
      <View>
        <Text>{`freeze-sheet:${userId}:${onConfirm ? 'confirm' : 'info'}`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="sheet-close" onPress={onClose} />
        {onConfirm ? (
          // Mirrors the real RatingFreezeSheet footer: "Play anyway"
          // fires onConfirm() THEN onClose(), same as the actual
          // component — a mock that only fired onConfirm would leave
          // `visible` stuck true and mask a real closing bug.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="sheet-confirm"
            onPress={() => {
              onConfirm();
              onClose();
            }}
          />
        ) : null}
      </View>
    );
  },
}));

const mockGetPublicProfile = getPublicProfile as jest.MockedFunction<typeof getPublicProfile>;
const mockGetPlayerRank = getPlayerRank as jest.MockedFunction<typeof getPlayerRank>;
const mockGetAcknowledged = getUnbookedPlayAcknowledged as jest.MockedFunction<typeof getUnbookedPlayAcknowledged>;
const mockAcknowledge = acknowledgeUnbookedPlay as jest.MockedFunction<typeof acknowledgeUnbookedPlay>;
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
  capturedConfirmBeforeCreate = undefined;
  mockGetPublicProfile.mockResolvedValue(ME);
  mockGetAcknowledged.mockResolvedValue(false);
  mockAcknowledge.mockResolvedValue(undefined);
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

  it('once calibrated, shows the compact booked-court line with a tappable second half', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
    await render(<PlayRankedScreen />);

    await screen.findByText(/Rating moves at half rate without a booked court\./);
    await screen.findByText('Your court not here?');
  });

  it('does not show the booked-court line while still calibrating', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 3 }));
    await render(<PlayRankedScreen />);

    await screen.findByText('3 of 10 calibration matches played');
    expect(screen.queryByText(/booked court/)).toBeNull();
  });

  it('tapping "Your court not here?" opens the sheet in info mode (no onConfirm)', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
    await render(<PlayRankedScreen />);

    const link = await screen.findByText('Your court not here?');
    fireEvent.press(link);

    await screen.findByText('freeze-sheet:me:info');
  });

  it('passes confirmBeforeCreate to RankedDirectInvite only for a calibrated Ranked-mode player', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
    await render(<PlayRankedScreen />);

    await screen.findByText('AIR/Rally Rank');
    expect(capturedConfirmBeforeCreate).toBeInstanceOf(Function);
  });

  it('does not pass confirmBeforeCreate while still calibrating', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: false, calibration_matches: 3 }));
    await render(<PlayRankedScreen />);

    await screen.findByText('3 of 10 calibration matches played');
    expect(capturedConfirmBeforeCreate).toBeUndefined();
  });

  it('does not pass confirmBeforeCreate in Casual mode, even for a calibrated player', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
    await render(<PlayRankedScreen />);
    await screen.findByText('AIR/Rally Rank');

    const casualTab = await screen.findByRole('button', { name: 'Casual' });
    fireEvent.press(casualTab);

    await screen.findByText('CASUAL');
    expect(capturedConfirmBeforeCreate).toBeUndefined();
  });

  it('confirmBeforeCreate resolves true when "Play anyway" is pressed, opening the sheet in confirm mode', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
    await render(<PlayRankedScreen />);
    await screen.findByText('AIR/Rally Rank');

    let result: Promise<boolean>;
    await act(() => {
      result = capturedConfirmBeforeCreate!();
    });
    await screen.findByText('freeze-sheet:me:confirm');
    fireEvent.press(screen.getByLabelText('sheet-confirm'));

    await expect(result!).resolves.toBe(true);
  });

  it('confirmBeforeCreate resolves false when the sheet is closed without confirming', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
    await render(<PlayRankedScreen />);
    await screen.findByText('AIR/Rally Rank');

    let result: Promise<boolean>;
    await act(() => {
      result = capturedConfirmBeforeCreate!();
    });
    await screen.findByText('freeze-sheet:me:confirm');
    fireEvent.press(screen.getByLabelText('sheet-close'));

    await expect(result!).resolves.toBe(false);
  });

  it('skips the dialog entirely once the player has already acknowledged (persisted from a prior session)', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
    mockGetAcknowledged.mockResolvedValue(true);
    await render(<PlayRankedScreen />);
    await screen.findByText('AIR/Rally Rank');
    await waitFor(() => expect(mockGetAcknowledged).toHaveBeenCalledWith('me'));

    let result: Promise<boolean>;
    await act(() => {
      result = capturedConfirmBeforeCreate!();
    });

    await expect(result!).resolves.toBe(true);
    expect(screen.queryByText(/freeze-sheet:/)).toBeNull();
  });

  it('persists the acknowledgement (best-effort) when "Play anyway" is pressed', async () => {
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
    await render(<PlayRankedScreen />);
    await screen.findByText('AIR/Rally Rank');

    let result: Promise<boolean>;
    await act(() => {
      result = capturedConfirmBeforeCreate!();
    });
    await screen.findByText('freeze-sheet:me:confirm');
    fireEvent.press(screen.getByLabelText('sheet-confirm'));

    await expect(result!).resolves.toBe(true);
    expect(mockAcknowledge).toHaveBeenCalledWith('me');
  });

  it('after confirming once, a second submit resolves true immediately without reopening the sheet', async () => {
    // Optimistic local state — the match already proceeded on the tap
    // alone, so a second Find match in the same session shouldn't ask
    // again even before the best-effort write has had time to land.
    mockGetPlayerRank.mockResolvedValue(rankFixture({ is_calibrated: true, tier: 3, pips: 2 }));
    await render(<PlayRankedScreen />);
    await screen.findByText('AIR/Rally Rank');

    let first: Promise<boolean>;
    await act(() => {
      first = capturedConfirmBeforeCreate!();
    });
    await screen.findByText('freeze-sheet:me:confirm');
    fireEvent.press(screen.getByLabelText('sheet-confirm'));
    await expect(first!).resolves.toBe(true);

    let second: Promise<boolean>;
    await act(() => {
      second = capturedConfirmBeforeCreate!();
    });
    await expect(second!).resolves.toBe(true);
    expect(screen.queryByText('freeze-sheet:me:confirm')).toBeNull();
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
