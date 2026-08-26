import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import NewOpenPlayScreen from '@/app/events/new';
import type { HostableBooking } from '@/lib/events';
import { createOpenPlayForBooking, listHostableBookings } from '@/lib/events';
import { getPublicProfile } from '@/lib/follows';

/**
 * The founder's own words: "casual games... your wins will be recorded
 * and losses but your rank won't be subtracted or added." Before this,
 * picking "Casual" on this screen skipped Ranked entirely — an open
 * invite list, no recorded result at all. Now it builds the same
 * structured party as "Ranked" does, differing only in `rated`. This
 * pins that the toggle actually reaches RankedPartyBuilder with the
 * right flag, not just that the screen renders — the RankedPartyBuilder
 * itself (and its own tests) own proving the rest of the RPC call.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/lib/events', () => ({
  ...jest.requireActual('@/lib/events'),
  listHostableBookings: jest.fn(),
  createOpenPlayForBooking: jest.fn(),
}));
jest.mock('@/lib/follows', () => ({
  ...jest.requireActual('@/lib/follows'),
  getPublicProfile: jest.fn(),
}));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

const mockPartyBuilder = jest.fn((_props: Record<string, unknown>) => null);
jest.mock('@/components/ranked/ranked-party-builder', () => ({
  RankedPartyBuilder: (props: Record<string, unknown>) => mockPartyBuilder(props),
}));

const mockListHostableBookings = listHostableBookings as jest.MockedFunction<typeof listHostableBookings>;
const mockCreateOpenPlay = createOpenPlayForBooking as jest.MockedFunction<typeof createOpenPlayForBooking>;
const mockGetPublicProfile = getPublicProfile as jest.MockedFunction<typeof getPublicProfile>;

function hostableFixture(overrides: Partial<HostableBooking> = {}): HostableBooking {
  return {
    bookingId: 'booking-a',
    courtId: 'court-a',
    courtName: 'Court A',
    venueName: 'Venue A',
    startTime: '2030-06-01T01:00:00.000Z',
    endTime: '2030-06-01T02:00:00.000Z',
    priceAmount: 70000,
    currency: 'PHP',
    existingEventId: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPublicProfile.mockResolvedValue({ id: 'me', display_name: 'Leou', avatar_url: null });
  mockListHostableBookings.mockResolvedValue([hostableFixture()]);
  mockCreateOpenPlay.mockResolvedValue({ eventId: 'event-1', invited: 0 });
});

it('defaults to Casual, and Casual now builds a structured party, not an open invite', async () => {
  await render(<NewOpenPlayScreen />);

  // The old open-invite copy ("splitting it is between you") no longer
  // appears attached to a player-invite list — the singles/doubles
  // picker is what's actually offered, for both modes now.
  await screen.findByText('Singles or doubles?');
  expect(screen.queryByText(/Create game and invite/)).toBeNull();
});

it('Casual creates the Open Play shell and then starts a match — same shape as Ranked, just unrated', async () => {
  await render(<NewOpenPlayScreen />);
  await screen.findByText('Singles or doubles?');

  fireEvent.press(screen.getByText('Start casual match'));

  await waitFor(() => expect(mockCreateOpenPlay).toHaveBeenCalled());
  expect(mockCreateOpenPlay.mock.calls[0][1]).toMatchObject({ bookingId: 'booking-a', playerIds: [] });
});

it('Ranked mode still says "Start ranked match", proving the toggle actually changes the flow', async () => {
  await render(<NewOpenPlayScreen />);
  await screen.findByText('Singles or doubles?');

  fireEvent.press(screen.getByText('Ranked'));

  await screen.findByText('Start ranked match');
  expect(screen.queryByText('Start casual match')).toBeNull();
});

it('threads rated:false through to RankedPartyBuilder for Casual', async () => {
  await render(<NewOpenPlayScreen />);
  await screen.findByText('Singles or doubles?');

  fireEvent.press(screen.getByText('Start casual match'));
  await waitFor(() => expect(mockPartyBuilder).toHaveBeenCalled());
  expect(mockPartyBuilder.mock.calls[0][0]).toMatchObject({ rated: false });
});

it('threads rated:true through to RankedPartyBuilder for Ranked', async () => {
  await render(<NewOpenPlayScreen />);
  await screen.findByText('Singles or doubles?');

  fireEvent.press(screen.getByText('Ranked'));
  fireEvent.press(await screen.findByText('Start ranked match'));
  await waitFor(() => expect(mockPartyBuilder).toHaveBeenCalled());
  expect(mockPartyBuilder.mock.calls[0][0]).toMatchObject({ rated: true });
});
