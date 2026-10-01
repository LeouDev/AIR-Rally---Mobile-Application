import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';

import BookingStatusScreen from '@/app/booking/[id]/index';
import type { BookingWithCourt } from '@/lib/bookings';
import { getBookingWithCourt } from '@/lib/bookings';

/**
 * The booking screen is where a player lands right after paying, and it
 * learns the payment went through by polling the booking row. Two ways
 * that poll used to end early, both leaving a paid booking on "Waiting
 * for payment confirmation" (or "Booking not found"):
 *  - one failed request stopped it for good, and if it was the FIRST
 *    request the screen said "Booking not found — It may belong to a
 *    different account" seconds after the player paid;
 *  - the 3-minute budget was fixed at mount, and "Complete payment"
 *    never started a new poll after a slow (QR Ph) payment outlasted it.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

jest.mock('@/lib/bookings', () => ({
  ...jest.requireActual('@/lib/bookings'),
  getBookingWithCourt: jest.fn(),
}));

jest.mock('@/lib/checkout', () => ({ cancelBookingViaApi: jest.fn() }));

const mockGetBooking = getBookingWithCourt as jest.MockedFunction<typeof getBookingWithCourt>;
const mockOpenAuthSession = WebBrowser.openAuthSessionAsync as jest.MockedFunction<
  typeof WebBrowser.openAuthSessionAsync
>;

function bookingFixture(overrides: Partial<BookingWithCourt>): BookingWithCourt {
  return {
    id: 'booking-1',
    court_id: 'court-1',
    user_id: 'user-1',
    start_time: '2030-06-01T01:00:00.000Z',
    end_time: '2030-06-01T02:00:00.000Z',
    status: 'pending',
    price_amount: 70000,
    currency: 'PHP',
    confirmation_code: 'ABC123',
    credit_amount_applied: 0,
    processing_fee_amount: 1066,
    paid_at: null,
    payment_provider: 'paymongo',
    paymongo_checkout_session_id: 'cs_abc',
    platform_fee_amount: null,
    venue_amount: null,
    cancelled_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    courts: { name: 'Rooftop Court', venues: { name: 'BGC Smash Pickleball', timezone: 'Asia/Manila' } },
    ...overrides,
  };
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps queued *Once values — a test that consumes fewer
  // reads than it queued would otherwise leak them into the next one.
  mockGetBooking.mockReset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it('keeps watching through a dropped request instead of calling the booking not found', async () => {
  mockGetBooking
    .mockRejectedValueOnce(new Error('Network request failed'))
    .mockResolvedValueOnce(bookingFixture({ status: 'pending' }))
    .mockResolvedValueOnce(bookingFixture({ status: 'confirmed', paid_at: '2026-08-01T00:01:00.000Z' }));

  await render(<BookingStatusScreen />);
  await advance(0);

  expect(screen.queryByText('Booking not found')).toBeNull();
  expect(screen.getByText("Couldn't load this booking")).toBeTruthy();

  await advance(3000);
  expect(screen.getByText('Waiting for payment confirmation')).toBeTruthy();

  await advance(3000);
  expect(screen.getByText('Booking confirmed')).toBeTruthy();
});

it('starts a fresh poll after "Complete payment", even once the first poll gave up', async () => {
  mockGetBooking.mockResolvedValue(bookingFixture({ status: 'pending' }));
  mockOpenAuthSession.mockResolvedValue({ type: 'dismiss' } as never);

  await render(<BookingStatusScreen />);
  // Outlast the first poll's whole budget, then some.
  await advance(4 * 60 * 1000);
  const callsWhenItGaveUp = mockGetBooking.mock.calls.length;
  await advance(60 * 1000);
  expect(mockGetBooking.mock.calls.length).toBe(callsWhenItGaveUp);

  // The player finishes paying in the checkout sheet.
  mockGetBooking.mockResolvedValue(bookingFixture({ status: 'confirmed', paid_at: '2026-08-01T00:05:00.000Z' }));
  await fireEvent.press(screen.getByText('Complete payment'));
  await advance(0);

  expect(screen.getByText('Booking confirmed')).toBeTruthy();
});
