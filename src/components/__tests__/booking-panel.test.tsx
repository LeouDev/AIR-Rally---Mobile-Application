import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { BookingPanel } from '@/components/booking-panel';
import type { AvailableSlot, Court, PublicProfile } from '@/lib/database.types';
import { createOpenPlayForBooking } from '@/lib/events';
import { getAvailableSlots } from '@/lib/bookings';
import { createCheckoutSession } from '@/lib/checkout';
import { searchPublicProfiles } from '@/lib/follows';
import type { VenueDetail } from '@/lib/venues';

/**
 * Regression cover for the invited-player roster.
 *
 * The bug this guards: `book`'s dependency array omitted `players`, and
 * PlayerPicker only mounts AFTER a slot is chosen — so adding playmates
 * changed no listed dependency, the memoized callback kept its original
 * empty roster, and `createOpenPlayForBooking` was never reached. The
 * booking and the payment both succeeded, so nothing surfaced the loss.
 *
 * These are deliberately behavioural: they drive the real picker the way
 * a player does (choose a slot, search a name, tap the result, reserve)
 * and assert on what the data layer was actually handed. A test that
 * inspected the dependency array instead would pass against any future
 * rewrite that reintroduced the same staleness by another route.
 */

jest.mock('@/lib/checkout', () => ({ createCheckoutSession: jest.fn() }));
jest.mock('@/lib/events', () => ({ createOpenPlayForBooking: jest.fn() }));
jest.mock('@/lib/follows', () => ({ searchPublicProfiles: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

// The toast lives above the navigator, which is the whole reason the
// invite-failure notice is routed through it — assert on the call.
const mockToastShow = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: mockToastShow }) }));

// Only the network call is faked — the real money math, timezone
// formatting and slot grouping stay in play, so the panel renders and
// labels its slots exactly as it does in the app.
jest.mock('@/lib/bookings', () => ({
  ...jest.requireActual('@/lib/bookings'),
  getAvailableSlots: jest.fn(),
}));

const CURRENT_USER_ID = '11111111-1111-1111-1111-111111111111';

jest.mock('@/providers/session', () => ({
  useSession: () => ({
    session: { user: { id: '11111111-1111-1111-1111-111111111111' } },
    isLoaded: true,
    needsAgreement: false,
    markAgreementAccepted: jest.fn(),
    signOut: jest.fn(),
  }),
}));

const mockGetAvailableSlots = getAvailableSlots as jest.MockedFunction<typeof getAvailableSlots>;
const mockCreateCheckoutSession = createCheckoutSession as jest.MockedFunction<typeof createCheckoutSession>;
const mockCreateOpenPlay = createOpenPlayForBooking as jest.MockedFunction<typeof createOpenPlayForBooking>;
const mockSearchProfiles = searchPublicProfiles as jest.MockedFunction<typeof searchPublicProfiles>;

const BOOKING_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const court: Court = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  venue_id: 'vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv',
  name: 'Rooftop Court',
  description: null,
  surface_type: 'Acrylic',
  indoor_outdoor: 'outdoor',
  capacity: 4,
  hourly_price: 700,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const venue: VenueDetail = {
  id: court.venue_id,
  name: 'BGC Smash Pickleball',
  description: null,
  address: null,
  city: 'Taguig',
  state_province: null,
  country: 'PH',
  latitude: null,
  longitude: null,
  phone: null,
  email: null,
  website: null,
  indoor_outdoor: 'outdoor',
  number_of_courts: 1,
  average_rating: 0,
  review_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  // Fixed so slot labels are deterministic regardless of the machine's
  // own clock — the app always formats in the venue's zone, not the
  // device's.
  timezone: 'Asia/Manila',
  starting_price: 700,
  active_court_count: 1,
  cover_image_path: null,
  courts: [court],
  amenities: [],
  hours: [],
  imagePaths: [],
};

/** 9:00 AM and 10:00 AM Manila (UTC+8) on a far-future date, so these
 * never fall behind "today" and get filtered by lead time. */
const SLOT_9AM: AvailableSlot = {
  slot_start: '2030-06-01T01:00:00.000Z',
  slot_end: '2030-06-01T02:00:00.000Z',
};
const SLOT_10AM: AvailableSlot = {
  slot_start: '2030-06-01T02:00:00.000Z',
  slot_end: '2030-06-01T03:00:00.000Z',
};

const ROBIN: PublicProfile = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  display_name: 'Robin Cruz',
  avatar_url: null,
};
const SAM: PublicProfile = {
  id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  display_name: 'Sam Diaz',
  avatar_url: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockToastShow.mockClear();
  mockGetAvailableSlots.mockResolvedValue([SLOT_9AM, SLOT_10AM]);
  mockCreateCheckoutSession.mockResolvedValue({
    success: true,
    data: {
      url: 'https://checkout.paymongo.com/test',
      bookingId: BOOKING_ID,
      creditApplied: 0,
      amountDue: 71066,
    },
  });
  mockCreateOpenPlay.mockResolvedValue({ eventId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', invited: 0 });
  mockSearchProfiles.mockResolvedValue([ROBIN, SAM]);
});

/** Renders and waits for the first slot grid to resolve. */
async function renderPanel() {
  await render(<BookingPanel venue={venue} />);
  await screen.findByText('9:00 AM');
}

/** Taps a slot by its venue-local label. */
async function pickSlot(label: string) {
  await fireEvent.press(screen.getByText(label));
}

/** Drives the real PlayerPicker: type a query, wait for the result row,
 * tap it. Mirrors exactly what a player does. */
async function addPlayer(profile: PublicProfile) {
  await fireEvent.changeText(screen.getByLabelText('Search players by name'), profile.display_name!);
  const row = await screen.findByText(profile.display_name!);
  await fireEvent.press(row);
}

async function reserve() {
  await fireEvent.press(screen.getByLabelText('Reserve & pay'));
}

describe('BookingPanel — invited player roster', () => {
  it('creates no Open Play game when nobody was invited', async () => {
    await renderPanel();
    await pickSlot('9:00 AM');
    await reserve();

    await waitFor(() => expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1));
    expect(mockCreateOpenPlay).not.toHaveBeenCalled();
  });

  it('passes a single invited player through to the booking', async () => {
    await renderPanel();
    await pickSlot('9:00 AM');
    await addPlayer(ROBIN);
    await reserve();

    await waitFor(() => expect(mockCreateOpenPlay).toHaveBeenCalledTimes(1));
    expect(mockCreateOpenPlay).toHaveBeenCalledWith(CURRENT_USER_ID, {
      bookingId: BOOKING_ID,
      playerIds: [ROBIN.id],
    });
  });

  it('passes every invited player, in order, when several are added', async () => {
    await renderPanel();
    await pickSlot('9:00 AM');
    await addPlayer(ROBIN);
    await addPlayer(SAM);
    await reserve();

    await waitFor(() => expect(mockCreateOpenPlay).toHaveBeenCalledTimes(1));
    expect(mockCreateOpenPlay).toHaveBeenCalledWith(CURRENT_USER_ID, {
      bookingId: BOOKING_ID,
      playerIds: [ROBIN.id, SAM.id],
    });
  });

  it('keeps the roster after the player switches to a different slot', async () => {
    await renderPanel();
    await pickSlot('9:00 AM');
    await addPlayer(ROBIN);

    // Deselect and choose the later slot. The roster is not tied to the
    // slot, so it must survive — and the booking must be made for the
    // slot actually showing when Reserve was tapped.
    await pickSlot('9:00 AM');
    await pickSlot('10:00 AM');
    await reserve();

    await waitFor(() => expect(mockCreateOpenPlay).toHaveBeenCalledTimes(1));
    expect(mockCreateOpenPlay).toHaveBeenCalledWith(CURRENT_USER_ID, {
      bookingId: BOOKING_ID,
      playerIds: [ROBIN.id],
    });
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
      courtId: court.id,
      startTime: SLOT_10AM.slot_start,
      endTime: SLOT_10AM.slot_end,
    });
  });

  it('drops a player removed from the roster before reserving', async () => {
    await renderPanel();
    await pickSlot('9:00 AM');
    await addPlayer(ROBIN);
    await addPlayer(SAM);
    await fireEvent.press(screen.getByLabelText(`Remove ${ROBIN.display_name}`));
    await reserve();

    await waitFor(() => expect(mockCreateOpenPlay).toHaveBeenCalledTimes(1));
    expect(mockCreateOpenPlay).toHaveBeenCalledWith(CURRENT_USER_ID, {
      bookingId: BOOKING_ID,
      playerIds: [SAM.id],
    });
  });

  it('never invites anyone when checkout itself fails', async () => {
    mockCreateCheckoutSession.mockResolvedValue({
      success: false,
      error: 'That time was just taken.',
    });

    await renderPanel();
    await pickSlot('9:00 AM');
    await addPlayer(ROBIN);
    await reserve();

    await waitFor(() => expect(screen.getByText('That time was just taken.')).toBeTruthy());
    expect(mockCreateOpenPlay).not.toHaveBeenCalled();
  });

  it('still completes the booking when the invite call fails, and says so somewhere that survives', async () => {
    mockCreateOpenPlay.mockRejectedValue(new Error('rpc exploded'));

    await renderPanel();
    await pickSlot('9:00 AM');
    await addPlayer(ROBIN);
    await reserve();

    // The payment is the thing the player committed to — a failed invite
    // is reported, never allowed to unwind the booking.
    //
    // The notice goes through the app-level toast, NOT this component's
    // own state: BookingPanel unmounts immediately afterwards when the
    // booking screen is pushed, so a message held here would never be
    // seen — which reopened the very failure this file exists to guard,
    // invites vanishing with nothing on screen to say so.
    await waitFor(() => expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1));
    expect(mockToastShow).toHaveBeenCalledWith(
      expect.stringContaining("couldn't invite your players"),
      'error'
    );
  });
});
