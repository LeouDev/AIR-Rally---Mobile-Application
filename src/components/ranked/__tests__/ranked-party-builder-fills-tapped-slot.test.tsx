import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { RankedPartyBuilder } from '@/components/ranked/ranked-party-builder';
import type { PublicProfile } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import { getPlayerRank } from '@/lib/ranked';

/**
 * Its own file for the same reason as
 * ranked-party-builder-debounce-fires.test.tsx: the real debounce
 * timer fires here (a result has to actually resolve to be tappable),
 * which poisons whatever render() runs next in the same file.
 *
 * The old shared search box filled whichever slot was "next open" —
 * order, not intent. Now that each slot owns its own search, picking
 * a result has to fill THAT slot specifically. Doubles' SECOND
 * opponent slot is the case that catches a regression to "next open":
 * it's neither the host nor the first empty slot in slot order (that's
 * partner), so a next-open bug would silently fill partner instead of
 * the slot actually tapped.
 */

jest.mock('@/lib/follows', () => ({ searchPublicProfiles: jest.fn() }));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getPlayerRank: jest.fn(),
  createRankedMatch: jest.fn(),
}));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));

const mockSearch = searchPublicProfiles as jest.MockedFunction<typeof searchPublicProfiles>;
const mockGetPlayerRank = getPlayerRank as jest.MockedFunction<typeof getPlayerRank>;

const HOST: PublicProfile = { id: 'host-1', display_name: 'Leou', avatar_url: null };
const ROBIN: PublicProfile = { id: 'opp-1', display_name: 'Robin', avatar_url: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPlayerRank.mockResolvedValue(null);
});

it('fills the slot that was actually tapped, not whichever is first in the list', async () => {
  mockSearch.mockResolvedValue([ROBIN]);
  await render(<RankedPartyBuilder host={HOST} matchType="doubles" onCreated={jest.fn()} />);

  // Tap the SECOND opponent slot specifically — partner (first empty
  // in slot order) and the first opponent slot are both left untouched.
  const opponentSlots = await screen.findAllByLabelText('Search for opponent');
  fireEvent.press(opponentSlots[1]);
  fireEvent.changeText(await screen.findByLabelText('Search players by name'), 'Ro');

  const result = await screen.findByText('Robin');
  fireEvent.press(result);

  // Robin fills exactly one slot; partner and one opponent slot are
  // still open — proof it landed in the tapped slot, not "next open".
  await screen.findByText('Robin');
  expect(screen.getAllByLabelText('Remove Robin')).toHaveLength(1);
  expect(await screen.findByLabelText('Search for partner')).toBeTruthy();
  expect(screen.getAllByLabelText('Search for opponent')).toHaveLength(1);
});
