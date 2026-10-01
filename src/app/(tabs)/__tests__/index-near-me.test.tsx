import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, Linking } from 'react-native';

import ExploreScreen from '@/app/(tabs)/index';
import { getCurrentCoords } from '@/lib/near-me';
import { listMarketplaceVenues } from '@/lib/venues';

/**
 * Explore's "Near me" toggle: location is requested on the tap (never at
 * launch), the list is reloaded with the player's position, and a refusal
 * explains itself with a way to Settings instead of silently doing nothing.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(cb, [cb]);
  },
}));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));
jest.mock('@/lib/favorites', () => ({
  listFavoriteVenueIds: jest.fn().mockResolvedValue([]),
  addFavorite: jest.fn(),
  removeFavorite: jest.fn(),
}));
jest.mock('@/lib/venues', () => ({
  ...jest.requireActual('@/lib/venues'),
  listMarketplaceVenues: jest.fn(),
  listAmenities: jest.fn().mockResolvedValue([]),
  listSurfaceTypes: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/lib/near-me', () => ({
  ...jest.requireActual('@/lib/near-me'),
  getCurrentCoords: jest.fn(),
}));
jest.mock('@/components/venue-request-form', () => ({ VenueRequestForm: () => null }));

const mockList = listMarketplaceVenues as jest.MockedFunction<typeof listMarketplaceVenues>;
const mockCoords = getCurrentCoords as jest.MockedFunction<typeof getCurrentCoords>;

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('asks for location only when tapped, then lists courts near the player', async () => {
  mockCoords.mockResolvedValue({ lat: 14.55, lng: 121.05 });
  await render(<ExploreScreen />);
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  expect(mockCoords).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByLabelText('Courts near me'));

  await waitFor(() =>
    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ near: { lat: 14.55, lng: 121.05, radiusKm: 25 } }))
  );
  expect(screen.getByText(/Within 25 km of you/)).toBeTruthy();
});

it('explains a refusal and offers Settings, instead of doing nothing', async () => {
  mockCoords.mockResolvedValue('denied');
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  await render(<ExploreScreen />);

  await fireEvent.press(screen.getByLabelText('Courts near me'));

  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  const [title, , buttons] = jest.mocked(Alert.alert).mock.calls[0];
  expect(title).toBe('Location is off');
  (buttons as { text: string; onPress?: () => void }[]).find((b) => b.text === 'Open Settings')?.onPress?.();
  expect(openSettings).toHaveBeenCalled();
  expect(mockList).not.toHaveBeenCalledWith(expect.objectContaining({ near: expect.anything() }));
});
