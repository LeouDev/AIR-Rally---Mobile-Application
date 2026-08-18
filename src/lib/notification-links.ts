import type { Href } from 'expo-router';

/**
 * Maps a notification's link (the web app's own URL vocabulary — see the
 * web repo's lib/notificationRoutes.ts, whose hrefs ride along in push
 * payloads as data.url and in notification rows as link_url) onto this
 * app's routes. Anything whose surface only exists on the web (court
 * side, clubs, events) lands on the Alerts tab rather than a dead end.
 */
export function resolveNotificationTarget(url: string | null | undefined): Href {
  if (!url) return '/(tabs)/notifications';

  const bookingMatch = url.match(/^\/bookings\/([0-9a-f-]{36})/i);
  if (bookingMatch) {
    return { pathname: '/booking/[id]', params: { id: bookingMatch[1] } };
  }
  if (url.startsWith('/bookings')) return '/(tabs)/bookings';
  if (url.startsWith('/list-your-court')) return '/owner';
  if (url.startsWith('/profile')) return '/(tabs)/profile';
  return '/(tabs)/notifications';
}
