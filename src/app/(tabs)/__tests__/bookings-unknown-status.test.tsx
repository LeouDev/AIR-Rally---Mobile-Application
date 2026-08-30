import { render, screen } from '@testing-library/react-native';
import React from 'react';

import BookingsScreen from '@/app/(tabs)/bookings';
import type { BookingWithCourt } from '@/lib/bookings';
import { listMyBookings } from '@/lib/bookings';
import { listHostableBookings } from '@/lib/events';

/**
 * statusBadge()'s switch had no default — an unrecognized BookingStatus
 * made it return undefined, and the render call right after does
 * `badge.label` unconditionally. That's a crash for the WHOLE list, not
 * just the one row with the unfamiliar status. Same shape as the ranked
 * match status gap this was found alongside.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('@/lib/bookings', () => ({
  ...jest.requireActual('@/lib/bookings'),
  listMyBookings: jest.fn(),
}));
jest.mock('@/lib/events', () => ({
  ...jest.requireActual('@/lib/events'),
  listHostableBookings: jest.fn(),
}));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

const mockListMyBookings = listMyBookings as jest.MockedFunction<typeof listMyBookings>;
const mockListHostableBookings = listHostableBookings as jest.MockedFunction<typeof listHostableBookings>;

const FAR_FUTURE = '2030-06-01T01:00:00.000Z';

function bookingFixture(overrides: Partial<BookingWithCourt>): BookingWithCourt {
  return {
    id: 'booking-1',
    court_id: 'court-1',
    user_id: 'me',
    start_time: FAR_FUTURE,
    end_time: '2030-06-01T02:00:00.000Z',
    status: 'confirmed',
    price_amount: 70000,
    currency: 'PHP',
    confirmation_code: 'ABC123',
    credit_amount_applied: 0,
    processing_fee_amount: 1066,
    paid_at: '2026-08-01T00:00:00.000Z',
    payment_provider: 'paymongo',
    paymongo_checkout_session_id: null,
    platform_fee_amount: null,
    venue_amount: null,
    cancelled_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    courts: { name: 'Rooftop Court', venues: { name: 'BGC Smash Pickleball', timezone: 'Asia/Manila' } },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListHostableBookings.mockResolvedValue([]);
});

it('renders a booking with a status this build does not recognize instead of crashing the list', async () => {
  mockListMyBookings.mockResolvedValue([bookingFixture({ status: 'refunded' as never })]);

  await render(<BookingsScreen />);

  await screen.findByText('Status pending');
  expect(screen.getByText(/Rooftop Court/)).toBeTruthy();
});
