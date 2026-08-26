import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { RankedPartyBuilder } from '@/components/ranked/ranked-party-builder';
import type { PublicProfile } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import { getPlayerRank } from '@/lib/ranked';

/**
 * Split out of ranked-party-builder.test.tsx on purpose: a test where
 * the real debounce timer actually FIRES (resolving searchPublicProfiles
 * outside any test-controlled act() boundary) leaves this RNTL/react-
 * test-renderer combination unable to mount a fresh tree in whatever
 * test runs immediately after in the SAME file — reliably reproduced as
 * screen.toJSON() === null on the next render(). A jest test file gets
 * its own fresh module/global state, so isolating each firing test into
 * its own file sidesteps the harness quirk rather than working around
 * it with fragile ordering.
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

it('batches three fast keystrokes into a single search of the final value', async () => {
  mockSearch.mockResolvedValue([ROBIN]);
  await render(<RankedPartyBuilder host={HOST} matchType="singles" onCreated={jest.fn()} />);

  fireEvent.press(screen.getByLabelText('Search for opponent'));
  const input = await screen.findByLabelText('Search players by name');
  fireEvent.changeText(input, 'R');
  fireEvent.changeText(input, 'Ro');
  fireEvent.changeText(input, 'Rob');

  expect(mockSearch).not.toHaveBeenCalled();

  await screen.findByText('Robin');
  expect(mockSearch).toHaveBeenCalledTimes(1);
  expect(mockSearch).toHaveBeenCalledWith('Rob', 8);
});
