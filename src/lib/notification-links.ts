import type { Href } from 'expo-router';

/**
 * Maps a notification's link (the web app's own URL vocabulary — see the
 * web repo's lib/notificationRoutes.ts, whose hrefs ride along in push
 * payloads as data.url and in notification rows as link_url) onto this
 * app's routes. Anything whose surface only exists on the web (clubs)
 * lands on the Alerts tab rather than a dead end.
 */
export function resolveNotificationTarget(url: string | null | undefined): Href {
  if (!url) return '/(tabs)/notifications';

  const bookingMatch = url.match(/^\/bookings\/([0-9a-f-]{36})/i);
  if (bookingMatch) {
    return { pathname: '/booking/[id]', params: { id: bookingMatch[1] } };
  }
  if (url.startsWith('/bookings')) return '/(tabs)/bookings';
  if (url.startsWith('/list-your-court')) return '/owner';

  const eventMatch = url.match(/^\/events\/([0-9a-f-]{36})/i);
  if (eventMatch) {
    return { pathname: '/events/[id]', params: { id: eventMatch[1] } };
  }

  const rankedMatchMatch = url.match(/^\/ranked\/match\/([0-9a-f-]{36})/i);
  if (rankedMatchMatch) {
    return { pathname: '/ranked/[matchId]', params: { matchId: rankedMatchMatch[1] } };
  }
  // apply_ranked_result() (20260810000068_dupr_rating_engine.sql) stamps a
  // bare '/ranked' link_url on every rank-change notification (calibration
  // complete, tier/pip up or down) — there is no page at that exact path
  // on either app (web's own /ranked has a layout but no page.tsx, so it's
  // dead there too). This app has no dedicated rank-detail screen at all;
  // the Profile tab's RankCard is the one place a player's own standing
  // renders, so that's the honest destination.
  if (url === '/ranked' || url.startsWith('/ranked?')) return '/(tabs)/profile';

  if (url.startsWith('/profile')) return '/(tabs)/profile';
  return '/(tabs)/notifications';
}
