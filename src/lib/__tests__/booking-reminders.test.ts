import * as Notifications from 'expo-notifications';

import { cancelBookingReminders, REMINDER_LEAD_MINUTES, syncBookingReminders } from '@/lib/booking-reminders';
import { listUpcomingConfirmedBookings, type BookingWithCourt } from '@/lib/bookings';

/**
 * No reminder existed anywhere — server or phone — so a player found out
 * they had a court booked when they checked the app, if at all. These pin
 * the phone-side reminders: one per upcoming confirmed booking, fired a
 * fixed lead before it, withdrawn when the booking goes away or moves.
 */

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('@/lib/bookings', () => ({
  ...jest.requireActual('@/lib/bookings'),
  listUpcomingConfirmedBookings: jest.fn(),
}));

const mocked = Notifications as unknown as Record<string, jest.Mock>;
const mockUpcoming = listUpcomingConfirmedBookings as jest.MockedFunction<typeof listUpcomingConfirmedBookings>;

const NOW = new Date('2026-10-04T02:00:00.000Z').getTime(); // 10:00 Manila

function booking(id: string, startIso: string): BookingWithCourt {
  return {
    id,
    start_time: startIso,
    end_time: startIso,
    status: 'confirmed',
    courts: { name: 'Rooftop Court', venues: { name: 'BGC Smash Pickleball', timezone: 'Asia/Manila' } },
  } as unknown as BookingWithCourt;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mocked.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mocked.getAllScheduledNotificationsAsync.mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('schedules a reminder the lead time before each upcoming booking, routed to that booking', async () => {
  mockUpcoming.mockResolvedValue([booking('b1', '2026-10-04T11:00:00.000Z')]); // 7 PM Manila

  await syncBookingReminders('me');

  expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  const request = mocked.scheduleNotificationAsync.mock.calls[0][0];
  expect(request.identifier).toBe('booking-reminder:b1:2026-10-04T11:00:00.000Z');
  expect(request.trigger.date).toEqual(new Date(Date.parse('2026-10-04T11:00:00.000Z') - REMINDER_LEAD_MINUTES * 60_000));
  expect(request.content.body).toContain('BGC Smash Pickleball · Rooftop Court at 7:00');
  expect(request.content.data).toEqual({ url: '/bookings/b1/confirmation' });
});

it('skips a booking whose reminder time has already passed', async () => {
  mockUpcoming.mockResolvedValue([booking('soon', '2026-10-04T03:00:00.000Z')]); // starts in 1 hour

  await syncBookingReminders('me');

  expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('withdraws reminders for bookings that were cancelled or moved, and keeps the rest', async () => {
  mockUpcoming.mockResolvedValue([booking('kept', '2026-10-05T11:00:00.000Z')]);
  mocked.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: 'booking-reminder:kept:2026-10-05T11:00:00.000Z' },
    { identifier: 'booking-reminder:cancelled:2026-10-06T11:00:00.000Z' },
    { identifier: 'booking-reminder:moved:2026-10-07T11:00:00.000Z' },
    { identifier: 'something-else' },
  ]);

  await syncBookingReminders('me');

  expect(mocked.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0]).sort()).toEqual([
    'booking-reminder:cancelled:2026-10-06T11:00:00.000Z',
    'booking-reminder:moved:2026-10-07T11:00:00.000Z',
  ]);
  // Already scheduled, so not scheduled twice.
  expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('does nothing, and never prompts, when notifications are not allowed', async () => {
  mocked.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
  mockUpcoming.mockResolvedValue([booking('b1', '2026-10-04T11:00:00.000Z')]);

  await syncBookingReminders('me');

  expect(mockUpcoming).not.toHaveBeenCalled();
  expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('never throws, even when bookings fail to load', async () => {
  mockUpcoming.mockRejectedValue(new Error('Network request failed'));

  await expect(syncBookingReminders('me')).resolves.toBeUndefined();
});

it("on sign-out cancels only this app's booking reminders", async () => {
  mocked.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: 'booking-reminder:b1:2026-10-05T11:00:00.000Z' },
    { identifier: 'something-else' },
  ]);

  await cancelBookingReminders();

  expect(mocked.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0])).toEqual([
    'booking-reminder:b1:2026-10-05T11:00:00.000Z',
  ]);
});
