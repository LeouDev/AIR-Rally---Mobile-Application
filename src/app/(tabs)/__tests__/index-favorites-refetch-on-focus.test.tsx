import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import ExploreScreen from '@/app/(tabs)/index';
import { listFavoriteVenueIds } from '@/lib/favorites';
import { listMarketplaceVenues } from '@/lib/venues';

/**
 * Same bug family as RankCard's stale rank fetch — Explore is a
 * NativeTabs tab, which iOS keeps alive across tab switches, so
 * favoriteIds used to be fetched once via a plain useEffect and never
 * again. venue/[id].tsx has its own independent favorite toggle, one
 * push away from any card here — un-favoriting there and coming back to
 * Explore left the card showing a heart that was already wrong. Can't
 * be caught by mounting once, same as RankCard: has to simulate the tab
 * regaining focus WITHOUT unmounting and assert a second fetch happens.
 */

let focusCallback: (() => void) | undefined;

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const ReactActual = jest.requireActual('react');
    focusCallback = cb;
    ReactActual.useEffect(cb, []);
  },
}));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));
jest.mock('@/lib/favorites', () => ({
  listFavoriteVenueIds: jest.fn(),
  addFavorite: jest.fn(),
  removeFavorite: jest.fn(),
}));
jest.mock('@/lib/venues', () => ({
  ...jest.requireActual('@/lib/venues'),
  listMarketplaceVenues: jest.fn(),
  listAmenities: jest.fn().mockResolvedValue([]),
  listSurfaceTypes: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/components/venue-request-form', () => ({
  VenueRequestForm: () => null,
}));
jest.mock('@/components/filter-sheet', () => ({
  FilterSheet: () => null,
}));

const mockListFavoriteVenueIds = listFavoriteVenueIds as jest.MockedFunction<typeof listFavoriteVenueIds>;
const mockListMarketplaceVenues = listMarketplaceVenues as jest.MockedFunction<typeof listMarketplaceVenues>;

beforeEach(() => {
  jest.clearAllMocks();
  focusCallback = undefined;
  mockListMarketplaceVenues.mockResolvedValue([]);
});

it('re-fetches favorites when the tab regains focus, without unmounting', async () => {
  mockListFavoriteVenueIds.mockResolvedValueOnce(['venue-1']);
  render(<ExploreScreen />);

  await waitFor(() => expect(mockListFavoriteVenueIds).toHaveBeenCalledTimes(1));
  expect(focusCallback).toBeDefined();

  // A favorite was toggled from venue/[id].tsx while Explore sat
  // retained underneath — the only way this screen catches up is a
  // second fetch when Explore regains focus.
  mockListFavoriteVenueIds.mockResolvedValueOnce([]);
  await act(async () => {
    focusCallback?.();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockListFavoriteVenueIds).toHaveBeenCalledTimes(2);
});
