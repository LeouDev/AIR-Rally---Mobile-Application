import { render, screen } from '@testing-library/react-native';
import React from 'react';

import NewOpenPlayScreen from '@/app/events/new';
import type { HostableBooking } from '@/lib/events';
import { listHostableBookings } from '@/lib/events';
import { getPublicProfile } from '@/lib/follows';

/**
 * bookings.tsx's "Start Game" hands this screen a specific bookingId —
 * without this, the screen's own default (first available booking)
 * would silently preselect whichever booking sorts first, not the one
 * actually tapped. Pins that the requested booking wins when it's
 * still available, and that an unavailable request falls back exactly
 * like no request at all, rather than erroring or selecting nothing.
 */

let mockParams: { bookingId?: string } = {};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
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

function hostableFixture(overrides: Partial<HostableBooking>): HostableBooking {
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

const BOOKING_A = hostableFixture({});
const BOOKING_B = hostableFixture({
  bookingId: 'booking-b',
  courtId: 'court-b',
  courtName: 'Court B',
  venueName: 'Venue B',
  startTime: '2030-06-02T01:00:00.000Z',
});
const BOOKING_C_ALREADY_HOSTED = hostableFixture({
  bookingId: 'booking-c',
  courtId: 'court-c',
  courtName: 'Court C',
  venueName: 'Venue C',
  startTime: '2030-06-03T01:00:00.000Z',
  existingEventId: 'event-existing',
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockGetPublicProfile.mockResolvedValue({ id: 'me', display_name: 'Leou', avatar_url: null });
});

describe('NewOpenPlayScreen — booking preselection from a Start Game deep link', () => {
  it('preselects the requested booking over the first-available default', async () => {
    mockParams = { bookingId: 'booking-b' };
    mockListHostableBookings.mockResolvedValue([BOOKING_A, BOOKING_B]);
    await render(<NewOpenPlayScreen />);

    const radios = await screen.findAllByRole('radio');
    expect(radios[0].props.accessibilityState.checked).toBe(false);
    expect(radios[1].props.accessibilityState.checked).toBe(true);
  });

  it('falls back to the first available booking when the requested one already has a game', async () => {
    mockParams = { bookingId: 'booking-c' };
    mockListHostableBookings.mockResolvedValue([BOOKING_A, BOOKING_B, BOOKING_C_ALREADY_HOSTED]);
    await render(<NewOpenPlayScreen />);

    // booking-c is filtered out of the list entirely (already hosted),
    // so only A and B are offered — A wins as the default.
    const radios = await screen.findAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0].props.accessibilityState.checked).toBe(true);
  });

  it('falls back to the first available booking with no request at all', async () => {
    mockListHostableBookings.mockResolvedValue([BOOKING_A, BOOKING_B]);
    await render(<NewOpenPlayScreen />);

    const radios = await screen.findAllByRole('radio');
    expect(radios[0].props.accessibilityState.checked).toBe(true);
  });
});
