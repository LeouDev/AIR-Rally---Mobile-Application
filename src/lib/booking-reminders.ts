import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { formatSlotTime, listUpcomingConfirmedBookings, type BookingWithCourt } from '@/lib/bookings';

/** How long before a booking its reminder fires — the calibration knob.
 * Long enough to cover getting across town, not just finding the car. */
export const REMINDER_LEAD_MINUTES = 120;

const PREFIX = 'booking-reminder:';
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

/** The start time is part of the id, so a rescheduled booking's old
 * reminder no longer matches and gets withdrawn on the next sync. */
function reminderId(booking: BookingWithCourt): string {
  return `${PREFIX}${booking.id}:${booking.start_time}`;
}

/**
 * Makes the phone's scheduled reminders match the player's upcoming
 * confirmed bookings: schedules any that are missing and withdraws any
 * for bookings that were cancelled, rescheduled or have already passed.
 * Local notifications, so this needs no server and no schema change.
 *
 * Best-effort and silent: never prompts for permission (if notifications
 * aren't allowed, there's nothing to schedule) and never throws.
 *
 * ponytail: phone-side, so a booking made or cancelled on the WEB is only
 * picked up the next time this app opens. Move to a server cron that
 * inserts a reminder notification if that gap shows up in practice.
 */
export async function syncBookingReminders(userId: string): Promise<void> {
  if (!isNative) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const now = Date.now();
    const wanted = new Map<string, { fireAt: Date; booking: BookingWithCourt }>();
    for (const booking of await listUpcomingConfirmedBookings(userId)) {
      const fireAt = new Date(new Date(booking.start_time).getTime() - REMINDER_LEAD_MINUTES * 60_000);
      if (fireAt.getTime() > now) wanted.set(reminderId(booking), { fireAt, booking });
    }

    const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) =>
      n.identifier.startsWith(PREFIX)
    );
    for (const notification of scheduled) {
      if (!wanted.has(notification.identifier)) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }

    const alreadyScheduled = new Set(scheduled.map((n) => n.identifier));
    for (const [identifier, { fireAt, booking }] of wanted) {
      if (alreadyScheduled.has(identifier)) continue;
      const timezone = booking.courts?.venues?.timezone ?? 'Asia/Manila';
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: `Your court is in ${REMINDER_LEAD_MINUTES / 60} hours`,
          body: `${booking.courts?.venues?.name ?? 'Your venue'} · ${booking.courts?.name ?? 'Court'} at ${formatSlotTime(booking.start_time, timezone)}`,
          // Same shape as a server push, so a tap routes through the same
          // resolver to this booking's screen.
          data: { url: `/bookings/${booking.id}/confirmation` },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
      });
    }
  } catch {
    // A missed reminder must never surface as an error anywhere.
  }
}

/** On sign-out: a signed-out phone must not keep announcing the last
 * account's bookings. */
export async function cancelBookingReminders(): Promise<void> {
  if (!isNative) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {
    // Best-effort, same as syncing.
  }
}
