import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import BookingStatusScreen from '@/app/booking/[id]/index';
import type { BookingWithCourt } from '@/lib/bookings';
import { getBookingWithCourt } from '@/lib/bookings';

/**
 * A confirmed, still-upcoming booking that used AIR/Rally Credits used
 * to render NOTHING where the cancel control usually is — `cancellable`
 * was false, and the ternary's else branch was a bare `null`. Absent and
 * denied look identical to a customer, and the one sentence explaining
 * why (the 48-hour policy) lived only inside the confirmation dialog
 * this booking could never open.
 *
 * These pin the fix as a property, not as which JSX renders: a
 * credit-final booking must show a disabled control naming the reason,
 * and the cancellation policy must be visible on the screen itself
 * rather than gated behind a dialog only a cancellable booking reaches.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
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

const FAR_FUTURE = '2030-06-01T01:00:00.000Z';

function bookingFixture(overrides: Partial<BookingWithCourt>): BookingWithCourt {
  return {
    id: 'booking-1',
    court_id: 'court-1',
    user_id: 'user-1',
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

describe('BookingStatusScreen — a credit-final booking is denied, not absent', () => {
  it('shows a disabled cancel control, explained by the card above rather than a per-button caption', async () => {
    // The founder flagged the same explanation appearing three times on
    // one screen (the card, this caption, Reschedule's own caption) —
    // the caption was removed. The property that still has to hold is
    // "a disabled control is explained somewhere on screen", now pinned
    // against the card's text instead of a caption directly beneath it.
    mockGetBooking.mockResolvedValue(bookingFixture({ credit_amount_applied: 30000 }));
    await render(<BookingStatusScreen />);

    const cancelButton = await screen.findByLabelText('Cancel booking');
    expect(cancelButton.props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByText("Can't be cancelled — paid with AIR/Rally Credits.")).toBeNull();
    await waitFor(() => {
      expect(
        screen.getByText(/This booking used AIR\/Rally Credits, which makes it final/)
      ).toBeTruthy();
    });
  });

  it('surfaces the 48-hour policy on the screen itself, not only inside a dialog this booking can never open', async () => {
    mockGetBooking.mockResolvedValue(bookingFixture({ credit_amount_applied: 30000 }));
    await render(<BookingStatusScreen />);

    await waitFor(() => {
      expect(
        screen.getByText(/This booking used AIR\/Rally Credits, which makes it final/)
      ).toBeTruthy();
    });
  });

  it('still offers a real, enabled cancel control for an ordinary confirmed booking', async () => {
    mockGetBooking.mockResolvedValue(bookingFixture({ credit_amount_applied: 0 }));
    await render(<BookingStatusScreen />);

    const cancelButton = await screen.findByLabelText('Cancel booking');
    expect(cancelButton.props.accessibilityState.disabled).toBeFalsy();
  });

  it('offers no cancel control at all for a booking that already happened, credit or not', async () => {
    const past = bookingFixture({
      credit_amount_applied: 30000,
      start_time: '2020-01-01T01:00:00.000Z',
      end_time: '2020-01-01T02:00:00.000Z',
    });
    mockGetBooking.mockResolvedValue(past);
    await render(<BookingStatusScreen />);

    await screen.findByText('BGC Smash Pickleball · Rooftop Court');
    expect(screen.queryByLabelText('Cancel booking')).toBeNull();
  });
});

/**
 * The same defect, one door over. complete_reschedule() cancels the
 * original booking through a raw UPDATE that never reaches
 * cancelBooking() — a confirmed→cancelled transition the server now
 * refuses when Credits were applied, mirroring the cancel rule. The
 * client's own `maybeReschedulable` never checked credit_amount_applied
 * at all, so without this the Reschedule button would sit there enabled,
 * offering a request the server is about to start rejecting, with
 * nothing on screen explaining why it failed.
 */
describe('BookingStatusScreen — a credit-final booking cannot be rescheduled either', () => {
  it('shows a disabled reschedule control, explained by the same card rather than its own caption', async () => {
    mockGetBooking.mockResolvedValue(bookingFixture({ credit_amount_applied: 30000 }));
    await render(<BookingStatusScreen />);

    const rescheduleButton = await screen.findByLabelText('Reschedule');
    expect(rescheduleButton.props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByText("Can't be rescheduled — paid with AIR/Rally Credits.")).toBeNull();
    await waitFor(() => {
      expect(
        screen.getByText(/This booking used AIR\/Rally Credits, which makes it final/)
      ).toBeTruthy();
    });
  });

  it('still offers a real, enabled reschedule control for an ordinary confirmed booking', async () => {
    mockGetBooking.mockResolvedValue(bookingFixture({ credit_amount_applied: 0 }));
    await render(<BookingStatusScreen />);

    const rescheduleButton = await screen.findByLabelText('Reschedule');
    expect(rescheduleButton.props.accessibilityState.disabled).toBeFalsy();
  });

  it('offers no reschedule control at all for a booking that already happened, credit or not', async () => {
    const past = bookingFixture({
      credit_amount_applied: 30000,
      start_time: '2020-01-01T01:00:00.000Z',
      end_time: '2020-01-01T02:00:00.000Z',
    });
    mockGetBooking.mockResolvedValue(past);
    await render(<BookingStatusScreen />);

    await screen.findByText('BGC Smash Pickleball · Rooftop Court');
    expect(screen.queryByLabelText('Reschedule')).toBeNull();
  });
});
