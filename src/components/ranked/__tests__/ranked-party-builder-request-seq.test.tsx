import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { RankedPartyBuilder } from '@/components/ranked/ranked-party-builder';
import type { PublicProfile } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import { getPlayerRank } from '@/lib/ranked';

/**
 * Split into its own file for the same reason as
 * ranked-party-builder-debounce-fires.test.tsx: the debounce timer here
 * fires twice for real, which poisons whatever render() runs next in
 * the same file.
 *
 * Pins that requestSeq — a DIFFERENT guard, solving a different problem
 * (which response wins once a search fires, not how many fire) — still
 * works underneath the new debounce. The two aren't redundant: without
 * requestSeq, a slow first search resolving after a fast second one
 * would overwrite its results with stale ones.
 *
 * Every assertion on rendered content goes through waitFor, even ones
 * that "should" already be true — a bare query immediately after a
 * real setTimeout fires can read a stale tree here (confirmed via a
 * throwaway repro: the same query inside waitFor sees the update, the
 * same query as a one-shot right after a raw sleep doesn't). waitFor's
 * repeated act-wrapped re-checks are what actually flushes it.
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
const KIM: PublicProfile = { id: 'opp-2', display_name: 'Kim', avatar_url: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPlayerRank.mockResolvedValue(null);
});

it("still lets requestSeq discard a stale response — debounce and the sequence guard solve different problems", async () => {
  let resolveFirst: (profiles: PublicProfile[]) => void = () => {};
  mockSearch.mockImplementation((q) => {
    if (q === 'Ro') return new Promise((resolve) => (resolveFirst = resolve));
    if (q === 'Ki') return Promise.resolve([KIM]);
    return Promise.resolve([]);
  });

  await render(<RankedPartyBuilder host={HOST} matchType="singles" onCreated={jest.fn()} />);

  fireEvent.press(screen.getByLabelText('Search for opponent'));
  fireEvent.changeText(await screen.findByLabelText('Search players by name'), 'Ro');
  await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('Ro', 8), { timeout: 3000 });

  fireEvent.changeText(screen.getByLabelText('Search players by name'), 'Ki');
  await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('Ki', 8), { timeout: 3000 });
  await waitFor(() => expect(screen.getByText('Kim')).toBeTruthy(), { timeout: 3000 });

  // The first request finally resolves, after the second already won —
  // its stale result must never displace Kim's.
  resolveFirst([ROBIN]);
  await waitFor(() => expect(screen.queryByText('Robin')).toBeNull(), { timeout: 3000 });
  expect(screen.getByText('Kim')).toBeTruthy();
});
