import { render, screen } from '@testing-library/react-native';
import React from 'react';

import ProfileScreen from '@/app/(tabs)/profile';
import type { PlayerMatchTotals } from '@/lib/database.types';
import { getFollowCounts } from '@/lib/follows';
import { getProfileStats } from '@/lib/profile-stats';
import { getPlayerMatchTotals } from '@/lib/ranked';

/**
 * The founder asked for "the # of total Wins whether its a normal
 * game or ranked games". That means player_match_totals (every
 * confirmed match, rated or not) — NOT PlayerRank.wins, which stays
 * ranked-only because it's what the rating is computed from. These
 * pin that Profile reads the combined view, and that a player with
 * no confirmed matches reads as 0 rather than as a dash or a failure.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(callback, [callback]);
  },
}));

const mockToastShow = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: mockToastShow }) }));

jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me', email: 'me@example.com' } }, signOut: jest.fn() }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  },
}));

jest.mock('@/lib/profile-stats', () => ({ getProfileStats: jest.fn() }));
jest.mock('@/lib/follows', () => ({
  ...jest.requireActual('@/lib/follows'),
  getFollowCounts: jest.fn(),
}));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getPlayerMatchTotals: jest.fn(),
  getPlayerRank: jest.fn(async () => null),
}));

const mockGetProfileStats = getProfileStats as jest.MockedFunction<typeof getProfileStats>;
const mockGetFollowCounts = getFollowCounts as jest.MockedFunction<typeof getFollowCounts>;
const mockGetPlayerMatchTotals = getPlayerMatchTotals as jest.MockedFunction<typeof getPlayerMatchTotals>;

function totalsFixture(overrides: Partial<PlayerMatchTotals> = {}): PlayerMatchTotals {
  return { user_id: 'me', total_matches: 20, wins: 12, losses: 8, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProfileStats.mockResolvedValue({ tripCount: 3, reviewCount: 1 });
  mockGetFollowCounts.mockResolvedValue({ followers: 5, following: 7 });
});

describe('ProfileScreen — total wins', () => {
  it('reads the combined all-matches view, not the ranked-only rank row', async () => {
    mockGetPlayerMatchTotals.mockResolvedValue(totalsFixture({ wins: 12 }));
    await render(<ProfileScreen />);

    await screen.findByText('Wins');
    expect(screen.getByText('12')).toBeTruthy();
    expect(mockGetPlayerMatchTotals).toHaveBeenCalledWith('me');
  });

  it('shows 0 for a player with no confirmed matches — the view has no row for them, which is not an error', async () => {
    mockGetPlayerMatchTotals.mockResolvedValue(null);
    await render(<ProfileScreen />);

    await screen.findByText('Wins');
    expect(screen.getByText('0')).toBeTruthy();
    // A silent failure would surface as the "—" placeholder plus a toast.
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  it('surfaces a real lookup failure rather than showing a wrong zero', async () => {
    mockGetPlayerMatchTotals.mockRejectedValue(new Error('network'));
    await render(<ProfileScreen />);

    await screen.findByText('Wins');
    expect(mockToastShow).toHaveBeenCalled();
  });
});
