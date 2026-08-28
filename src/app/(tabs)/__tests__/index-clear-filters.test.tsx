import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import ExploreScreen from '@/app/(tabs)/index';
import { listMarketplaceVenues } from '@/lib/venues';

/**
 * The founder got stuck on this screen: search text + two active filters,
 * zero results, no way back to a populated list short of force-quitting.
 * Clearing the search text's `x` re-fetches, but filters stay applied —
 * if THEY alone also match nothing, the same empty state renders again
 * with no visible change, reading as frozen rather than "still filtered."
 * Filters could only be reset via the separate filter sheet otherwise,
 * unreachable from this screen without noticing the icon. This pins that
 * one tap on "Clear search & filters" restores both at once.
 */

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
jest.mock('@/components/venue-request-form', () => ({
  VenueRequestForm: () => null,
}));
// The real sheet is a full modal reached by opening it first; this test
// only needs a way to trigger onApply the way a real filter selection
// eventually would, so the trigger renders unconditionally rather than
// threading the modal's own open/close state through the test.
jest.mock('@/components/filter-sheet', () => {
  const { Pressable, Text } = require('react-native');
  return {
    FilterSheet: ({ onApply }: { onApply: (f: object) => void }) => (
      <Pressable accessibilityLabel="Apply test filter" onPress={() => onApply({ minRating: 4 })}>
        <Text>Apply test filter</Text>
      </Pressable>
    ),
  };
});

const mockListMarketplaceVenues = listMarketplaceVenues as jest.MockedFunction<typeof listMarketplaceVenues>;

// Real timers throughout, with waitFor polling rather than a fixed
// delay — a fixed real-world wait proved flaky against the debounce's
// actual 300ms (fine once the runtime had warmed up, not always on the
// very first render in a fresh test file).

beforeEach(() => {
  jest.clearAllMocks();
  // Zero results regardless of query/filters — the exact shape of the
  // founder's report: nothing matches, no matter what's applied.
  mockListMarketplaceVenues.mockResolvedValue([]);
});

describe('Explore empty state — clearing search and filters', () => {
  it('offers a way back once search text and a filter are both active, and it actually clears both', async () => {
    render(<ExploreScreen />);

    // Initial unfiltered load settles first.
    await waitFor(() => expect(mockListMarketplaceVenues).toHaveBeenCalledWith({ q: '' }));

    // Type a search that also matches nothing.
    fireEvent.changeText(screen.getByPlaceholderText('Venue, court, city, or barangay'), 'mandaue');
    await waitFor(() => expect(mockListMarketplaceVenues).toHaveBeenCalledWith({ q: 'mandaue' }));

    // Apply a filter via the (mocked) sheet.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Apply test filter'));
    });
    await waitFor(() => expect(screen.getByLabelText('Filters, 1 active')).toBeTruthy());

    const clearButton = screen.getByLabelText('Clear search & filters');
    await act(async () => {
      fireEvent.press(clearButton);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Venue, court, city, or barangay').props.value).toBe('');
      expect(screen.getByLabelText('Filters')).toBeTruthy(); // no longer "1 active"
      expect(screen.queryByLabelText('Clear search & filters')).toBeNull();
    });

    // The re-fetch this triggers must actually go out with both cleared —
    // otherwise the button resets the UI's own labels without the state
    // that produces results ever actually changing.
    await waitFor(() => {
      const lastCall = mockListMarketplaceVenues.mock.calls.at(-1)?.[0];
      expect(lastCall).toEqual({ q: '' });
    });
  }, 15000);

  it('does not show the clear affordance on the bare, unfiltered empty state — there is nothing to clear', async () => {
    render(<ExploreScreen />);
    await waitFor(() => expect(mockListMarketplaceVenues).toHaveBeenCalledWith({ q: '' }));

    expect(screen.queryByLabelText('Clear search & filters')).toBeNull();
  });
});
