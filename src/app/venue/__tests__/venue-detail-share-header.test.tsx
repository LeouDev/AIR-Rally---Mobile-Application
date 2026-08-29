import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ActionSheetIOS, Platform } from 'react-native';
import React from 'react';

import VenueDetailScreen from '@/app/venue/[id]';
import { instagramStoriesAvailable, shareCard, shareToInstagramStory } from '@/lib/share';
import { getVenueDetail, type VenueDetail } from '@/lib/venues';

/**
 * The founder's call on the venue header: one icon, not two. Instagram
 * Story wasn't deleted — it's a real, deliberately-declared capability
 * (app.json's instagram-stories scheme) — it just moved behind the
 * single Share icon as a choice, rather than getting its own button.
 */

jest.mock('expo-router', () => {
  const actual = jest.requireActual('react-native');
  return {
    useLocalSearchParams: () => ({ id: 'venue-1' }),
    Stack: {
      Screen: (props: { options?: { headerRight?: () => React.ReactNode } }) =>
        props.options?.headerRight ? props.options.headerRight() : null,
    },
  };
});
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));
jest.mock('@/lib/venues', () => ({
  ...jest.requireActual('@/lib/venues'),
  getVenueDetail: jest.fn(),
}));
jest.mock('@/lib/favorites', () => ({
  listFavoriteVenueIds: jest.fn().mockResolvedValue([]),
  addFavorite: jest.fn(),
  removeFavorite: jest.fn(),
}));
jest.mock('@/lib/share', () => ({
  instagramStoriesAvailable: jest.fn(),
  shareCard: jest.fn(),
  shareToInstagramStory: jest.fn(),
}));
jest.mock('@/components/booking-panel', () => ({ BookingPanel: () => null }));
jest.mock('@/components/venue-reviews', () => ({ VenueReviews: () => null }));
jest.mock('@/components/venue-share-card', () => ({
  VenueShareCard: () => null,
  venueShareMessage: () => 'Check out this venue',
  venueShareUrl: (id: string) => `https://air-rally.com/courts/${id}`,
}));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn().mockResolvedValue('file:///x.png') }));

const mockGetVenueDetail = getVenueDetail as jest.MockedFunction<typeof getVenueDetail>;
const mockInstagramAvailable = instagramStoriesAvailable as jest.MockedFunction<typeof instagramStoriesAvailable>;
const mockShareCard = shareCard as jest.MockedFunction<typeof shareCard>;
const mockShareToInstagramStory = shareToInstagramStory as jest.MockedFunction<typeof shareToInstagramStory>;
const mockShowActionSheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});

function venueFixture(): VenueDetail {
  return {
    id: 'venue-1',
    name: 'Rally Point',
    description: null,
    address: null,
    city: null,
    state_province: null,
    country: null,
    latitude: null,
    longitude: null,
    phone: null,
    email: null,
    website: null,
    indoor_outdoor: 'outdoor',
    number_of_courts: 1,
    average_rating: 0,
    review_count: 0,
    created_at: '2026-08-01T00:00:00.000Z',
    timezone: 'Asia/Manila',
    starting_price: null,
    active_court_count: 1,
    cover_image_path: null,
    courts: [],
    amenities: [],
    hours: [],
    imagePaths: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetVenueDetail.mockResolvedValue(venueFixture());
  Platform.OS = 'ios';
});

it('shows exactly one header icon, not a separate Instagram button', async () => {
  mockInstagramAvailable.mockReturnValue(true);
  await render(<VenueDetailScreen />);

  await screen.findByLabelText('Share this court');
  expect(screen.queryByLabelText('Share to Instagram Story')).toBeNull();
});

it('goes straight to the OS share sheet when Instagram Story is not offerable', async () => {
  mockInstagramAvailable.mockReturnValue(false);
  await render(<VenueDetailScreen />);

  const share = await screen.findByLabelText('Share this court');
  await act(async () => {
    fireEvent.press(share);
  });

  expect(mockShowActionSheet).not.toHaveBeenCalled();
  expect(mockShareCard).toHaveBeenCalled();
  expect(mockShareToInstagramStory).not.toHaveBeenCalled();
});

it('offers a choice between the OS share sheet and Instagram Story when both are available', async () => {
  mockInstagramAvailable.mockReturnValue(true);
  await render(<VenueDetailScreen />);

  const share = await screen.findByLabelText('Share this court');
  await act(async () => {
    fireEvent.press(share);
  });

  expect(mockShowActionSheet).toHaveBeenCalledTimes(1);
  const [options, callback] = mockShowActionSheet.mock.calls[0];
  expect(options.options).toContain('Instagram Story');

  // Picking the Instagram Story option calls that path, not the OS sheet.
  const instagramIndex = options.options.indexOf('Instagram Story');
  await act(async () => {
    callback(instagramIndex);
  });
  expect(mockShareToInstagramStory).toHaveBeenCalled();
  expect(mockShareCard).not.toHaveBeenCalled();
});
