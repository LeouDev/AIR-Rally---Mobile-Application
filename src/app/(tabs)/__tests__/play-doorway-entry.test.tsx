import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import PlayScreen from '@/app/(tabs)/play';
import { listMyEventStatuses, listUpcomingEvents } from '@/lib/events';

/**
 * The Play tab is the tab a player presses when they want to play, and
 * until now its only action was "Start a game" → /events/new, which
 * hard-returns without a confirmed booking. So the one path that needs
 * no booking sat on Profile, and the tab named Play offered only the
 * gated one — backwards for the exact player the doorway exists for.
 *
 * Pins that the PRIMARY action is the doorway, that Open Play is still
 * reachable as its own secondary action (it isn't being removed — it's
 * a genuinely different thing), and that the empty state stops telling
 * a player with no court that booking one is their only way to play.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(cb, [cb]);
  },
}));
jest.mock('@/lib/events', () => ({
  ...jest.requireActual('@/lib/events'),
  listUpcomingEvents: jest.fn(),
  listMyEventStatuses: jest.fn(),
}));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

const mockList = listUpcomingEvents as jest.MockedFunction<typeof listUpcomingEvents>;
const mockStatuses = listMyEventStatuses as jest.MockedFunction<typeof listMyEventStatuses>;
const mockPush = router.push as jest.MockedFunction<typeof router.push>;

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockStatuses.mockResolvedValue(new Map());
});

it('sends the primary action to the booking-free doorway, not the booking-gated flow', async () => {
  await render(<PlayScreen />);

  await fireEvent.press(await screen.findByLabelText('Start a game'));

  expect(mockPush).toHaveBeenCalledWith('/ranked/play');
  expect(mockPush).not.toHaveBeenCalledWith('/events/new');
});

it('still offers Open Play as its own action — it is not being replaced', async () => {
  await render(<PlayScreen />);

  await fireEvent.press(await screen.findByLabelText('Host on your booking'));

  expect(mockPush).toHaveBeenCalledWith('/events/new');
});

it('stops telling a player with no games that booking a court is the only way to play', async () => {
  await render(<PlayScreen />);

  await screen.findByText('No open games right now');
  // The old copy — "Book a court and add your playmates" — was addressed
  // to someone who has a court to book. Nobody reading an empty Play tab
  // necessarily does.
  expect(screen.queryByText(/Book a court and add your playmates/i)).toBeNull();
  expect(screen.getByText(/don't need one to play/i)).toBeTruthy();
});
