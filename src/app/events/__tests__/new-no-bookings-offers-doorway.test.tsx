import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import NewOpenPlayScreen from '@/app/events/new';
import { listHostableBookings } from '@/lib/events';
import { getPublicProfile } from '@/lib/follows';

/**
 * A player with no bookings who lands here used to get "You need a court
 * first" and a single Find-a-court button. That's honest about Open Play
 * — it genuinely requires a booked court — but it's a dead end, because
 * it answers "how do I host an Open Play" when the question underneath
 * is "how do I play". Playing needs no booking; only Open Play does.
 *
 * Pins that this state offers the booking-free doorway, and that Find a
 * court survives as the secondary action rather than being replaced.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/lib/events', () => ({
  ...jest.requireActual('@/lib/events'),
  listHostableBookings: jest.fn(),
}));
jest.mock('@/lib/follows', () => ({
  ...jest.requireActual('@/lib/follows'),
  getPublicProfile: jest.fn(),
}));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

const mockListHostableBookings = listHostableBookings as jest.MockedFunction<typeof listHostableBookings>;
const mockGetPublicProfile = getPublicProfile as jest.MockedFunction<typeof getPublicProfile>;
const mockPush = router.push as jest.MockedFunction<typeof router.push>;

beforeEach(() => {
  jest.clearAllMocks();
  mockListHostableBookings.mockResolvedValue([]);
  mockGetPublicProfile.mockResolvedValue({ id: 'me', display_name: 'Leou', avatar_url: null });
});

it('offers the booking-free doorway to someone with no bookings', async () => {
  await render(<NewOpenPlayScreen />);

  await fireEvent.press(await screen.findByLabelText('Start a game without a court'));

  expect(mockPush).toHaveBeenCalledWith('/ranked/play');
});

it('keeps Find a court as the secondary way out', async () => {
  await render(<NewOpenPlayScreen />);

  await fireEvent.press(await screen.findByLabelText('Find a court'));

  expect(mockPush).toHaveBeenCalledWith('/(tabs)');
});
