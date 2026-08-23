import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import BookingsScreen from '@/app/(tabs)/bookings';
import type { BookingWithCourt } from '@/lib/bookings';
import { listMyBookings } from '@/lib/bookings';
import type { HostableBooking } from '@/lib/events';
import { listHostableBookings } from '@/lib/events';

/**
 * The Wallet-card "Start Game" affordance only belongs on a booking
 * that can actually still host one — the same rule events/new.tsx's
 * own picker already enforces (pending/confirmed, upcoming, no event
 * yet). These pin that the chevron/action is offered exactly there,
 * never on a booking that already has a game, and that tapping the
 * card body still reaches the booking detail screen untouched by any
 * of this — the new affordance is additive, not a replacement.
 */

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
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

function hostableFixture(overrides: Partial<HostableBooking>): HostableBooking {
  return {
    bookingId: 'booking-1',
    courtId: 'court-1',
    courtName: 'Rooftop Court',
    venueName: 'BGC Smash Pickleball',
    startTime: FAR_FUTURE,
    endTime: '2030-06-01T02:00:00.000Z',
    priceAmount: 70000,
    currency: 'PHP',
    existingEventId: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BookingsScreen — the Start Game affordance', () => {
  it('offers Start Game on a booking with no game yet, and it starts that exact booking', async () => {
    mockListMyBookings.mockResolvedValue([bookingFixture({})]);
    mockListHostableBookings.mockResolvedValue([hostableFixture({})]);
    await render(<BookingsScreen />);

    const chevron = await screen.findByLabelText('Show actions');
    fireEvent.press(chevron);

    const startGame = await screen.findByText('Start Game');
    fireEvent.press(startGame);

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/new', params: { bookingId: 'booking-1' } });
  });

  it("hides the affordance entirely for a booking that already has a game — never offers an action that lands on the wrong one", async () => {
    mockListMyBookings.mockResolvedValue([bookingFixture({})]);
    mockListHostableBookings.mockResolvedValue([hostableFixture({ existingEventId: 'event-1' })]);
    await render(<BookingsScreen />);

    await screen.findByText('BGC Smash Pickleball · Rooftop Court');
    expect(screen.queryByLabelText('Show actions')).toBeNull();
  });

  it('still opens the booking detail screen on a tap outside the chevron, unchanged', async () => {
    mockListMyBookings.mockResolvedValue([bookingFixture({})]);
    mockListHostableBookings.mockResolvedValue([hostableFixture({})]);
    await render(<BookingsScreen />);

    const card = await screen.findByText('BGC Smash Pickleball · Rooftop Court');
    fireEvent.press(card);

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/booking/[id]', params: { id: 'booking-1' } });
  });
});
