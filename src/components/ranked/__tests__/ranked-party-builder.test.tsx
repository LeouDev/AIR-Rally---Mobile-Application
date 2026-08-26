import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { RankedPartyBuilder } from '@/components/ranked/ranked-party-builder';
import type { PublicProfile } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import { getPlayerRank } from '@/lib/ranked';

/**
 * searchPublicProfiles() runs a leading-wildcard ILIKE — measured at
 * 1.375s cold, 150-800ms warm against live staging. Un-debounced, a
 * four-letter name fired three of those overlapping. This pins that
 * typing doesn't fire a search at all if the query drops back below
 * the minimum before the debounce window closes.
 *
 * This is the ONLY debounce test in this file — see
 * ranked-party-builder-debounce-fires.test.tsx and
 * ranked-party-builder-request-seq.test.tsx for why the two tests
 * where the debounce timer actually FIRES each live alone in their
 * own file, rather than sharing this one.
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

describe('RankedPartyBuilder — search debounce', () => {
  it('cancels the pending search when the query drops back below the minimum before the debounce fires', async () => {
    mockSearch.mockResolvedValue([ROBIN]);
    await render(<RankedPartyBuilder host={HOST} matchType="singles" onCreated={jest.fn()} />);

    fireEvent.press(screen.getByLabelText('Search for opponent'));
    const input = await screen.findByLabelText('Search players by name');
    fireEvent.changeText(input, 'Ro');
    fireEvent.changeText(input, 'R');

    // Long enough that a fired-and-not-cancelled timer would have
    // resolved by now — proving absence, not just "not yet".
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
