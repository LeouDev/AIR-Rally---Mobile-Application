import type { Href } from 'expo-router';

/**
 * Type-based fallback for the Alerts list only (see notifications.tsx),
 * which reads link_url straight off the row instead of resolving one —
 * post_liked/post_reshared/post_mention are written by
 * 20260810000032_post_reshares_and_engagement_notifications.sql without a
 * link_url at all, so without this every tap on one of them silently did
 * nothing (the resolved target equaled the current screen). A push tap
 * never needs this: the webhook already resolves a full url server-side,
 * via the web repo's notificationHref(), before the payload reaches the
 * phone.
 */
const TYPE_FALLBACK: Record<string, string> = {
  post_liked: '/court-side',
  post_reshared: '/court-side',
  post_mention: '/court-side',
};

/**
 * Maps a notification's link (the web app's own URL vocabulary — see the
 * web repo's lib/notificationRoutes.ts, whose hrefs ride along in push
 * payloads as data.url and in notification rows as link_url) onto this
 * app's routes. Anything whose surface only exists on the web (clubs)
 * lands on the Alerts tab rather than a dead end.
 */
export function resolveNotificationTarget(url: string | null | undefined, type?: string | null): Href {
  const effectiveUrl = url || (type ? TYPE_FALLBACK[type] : undefined);
  if (!effectiveUrl) return '/(tabs)/notifications';

  const bookingMatch = effectiveUrl.match(/^\/bookings\/([0-9a-f-]{36})/i);
  if (bookingMatch) {
    return { pathname: '/booking/[id]', params: { id: bookingMatch[1] } };
  }
  if (effectiveUrl.startsWith('/bookings')) return '/(tabs)/bookings';
  if (effectiveUrl.startsWith('/list-your-court')) return '/owner';

  const eventMatch = effectiveUrl.match(/^\/events\/([0-9a-f-]{36})/i);
  if (eventMatch) {
    return { pathname: '/events/[id]', params: { id: eventMatch[1] } };
  }

  const rankedMatchMatch = effectiveUrl.match(/^\/ranked\/match\/([0-9a-f-]{36})/i);
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
  if (effectiveUrl === '/ranked' || effectiveUrl.startsWith('/ranked?')) return '/(tabs)/profile';

  if (effectiveUrl.startsWith('/profile')) return '/(tabs)/profile';
  // COURT/Side shipped after this fallback did (see git history) — a bare
  // /court-side link now has a real screen (src/app/court-side/index.tsx)
  // to land on instead of Alerts.
  if (effectiveUrl.startsWith('/court-side')) return '/court-side';

  return '/(tabs)/notifications';
}
