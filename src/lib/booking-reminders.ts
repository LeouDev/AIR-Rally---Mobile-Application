import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const PREFIX = 'booking-reminder:';
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Booking reminders come from the server now (web migration 125: one push
 * two hours before each confirmed booking), which also covers bookings made
 * on the website. Earlier versions of this app scheduled their own on the
 * phone; this clears those, so nobody hears about a booking twice. It runs
 * when the tabs open and on sign-out.
 */
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
    // Best-effort: a reminder left behind is a duplicate, not a failure.
  }
}
