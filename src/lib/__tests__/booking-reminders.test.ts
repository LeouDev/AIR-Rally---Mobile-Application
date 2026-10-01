import * as Notifications from 'expo-notifications';

import { cancelBookingReminders } from '@/lib/booking-reminders';

/**
 * The server sends booking reminders now. What's left on the phone is
 * clean-up: reminders earlier versions scheduled must go, and nothing else
 * the app scheduled may go with them.
 */

jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
}));

const mocked = Notifications as unknown as Record<string, jest.Mock>;

it("clears only the booking reminders this app scheduled, leaving other notifications", async () => {
  mocked.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: 'booking-reminder:b1:2026-10-05T11:00:00.000Z' },
    { identifier: 'something-else' },
  ]);

  await cancelBookingReminders();

  expect(mocked.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0])).toEqual([
    'booking-reminder:b1:2026-10-05T11:00:00.000Z',
  ]);
});
