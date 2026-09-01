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
 *
 * CTO audit, 2026-09-01: parsed every `insert into public.notifications`
 * across all migrations, keyed by type, kept only each type's
 * HIGHEST-numbered migration (a later trigger replaces an earlier one's
 * definition). 16 of 42 notification types have no link_url at all in
 * their current definition — this map is the only thing standing
 * between one of those and a silent dead end. Every entry below this
 * comment was added from that audit; the three above it predate it.
 */
export const TYPE_FALLBACK: Record<string, string> = {
  post_liked: '/court-side',
  post_reshared: '/court-side',
  post_mention: '/court-side',
  // Nothing about a booking's specific id survives to this layer without
  // a link_url — landing on the Bookings tab lets the player find the
  // one the notification meant themselves, honest rather than precise.
  booking_cancelled: '/(tabs)/bookings',
  booking_created: '/(tabs)/bookings',
  booking_received: '/(tabs)/bookings',
  reschedule_completed: '/(tabs)/bookings',
  credits_added: '/credits',
  // Owner-facing: a venue's approval/rejection or a review lands on the
  // owner dashboard, the same destination payout and list-your-court
  // events already use above — there's no per-notification venue id to
  // route more precisely to without a link_url.
  venue_approved: '/owner',
  venue_rejected: '/owner',
  review_received: '/owner',
  // clubs/index.tsx lists the viewer's own memberships ("myClubs") — the
  // same reasoning as the bookings tab above: no club id survives
  // without a link_url, so land where they can find the one that
  // changed themselves rather than guess which of possibly several.
  club_approved: '/clubs',
  club_join_request: '/clubs',
  club_membership_approved: '/clubs',
  club_suspended: '/clubs',
};

/** Notification types with NO link_url and deliberately no TYPE_FALLBACK
 * entry either — the Alerts tab is the honest destination, not an
 * unwritten accident like the other 13 (now fixed above) turned out to
 * be. Exists so the enumeration test below can tell "considered and
 * decided" apart from "nobody has looked at this yet" — the second is
 * exactly how the venue/Open-Match/support dead-ends shipped. */
export const INTENTIONALLY_UNROUTED = new Set<string>([
  // Confirms an email address changed — there is nothing to open; the
  // fact of the notification IS the whole message.
  'email_confirmed',
]);

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
  // 'payout_sent' (20260810000095_notify_owner_on_payout_settled.sql)
  // stamps '/list-your-court/earnings' specifically — checked before the
  // generic /list-your-court prefix below so a payslip notification lands
  // scrolled to the Settlements block that shows the change it just
  // announced, not just the top of the screen.
  if (effectiveUrl.startsWith('/list-your-court/earnings')) {
    return { pathname: '/owner', params: { highlight: 'settlements' } };
  }
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

  // Support replies (support_request_resolved, stamped '/support' by
  // notify_on_support_resolution in 20260810000088). Before this app had
  // a support screen these fell through to the Alerts tab — the screen
  // the user was already on — so tapping the notification appeared to do
  // nothing at all while actually navigating successfully.
  if (effectiveUrl.startsWith('/support')) return '/support';

  if (effectiveUrl.startsWith('/profile')) return '/(tabs)/profile';
  // COURT/Side shipped after this fallback did (see git history) — a bare
  // /court-side link now has a real screen (src/app/court-side/index.tsx)
  // to land on instead of Alerts.
  if (effectiveUrl.startsWith('/court-side')) return '/court-side';

  // Open Match's broadcast notification (create_open_match, migration 119)
  // stamps '/ranked/open/<id>' — the feature's entire discovery path, since
  // creating an open match is what notifies everyone in the city. There is
  // no dedicated open-match detail ROUTE in this app (the join flow is a
  // sheet opened from a row tap, not a screen reachable by id), so this
  // fell through to Alerts — the same "appeared to do nothing" shape as
  // the /support case above, except this one breaks the tap that's
  // supposed to bring people INTO the feature. The Play tab is where the
  // open-games list actually lives; land there rather than invent a route.
  if (effectiveUrl.startsWith('/ranked/open')) return '/(tabs)/play';

  // 'venue_requested_listed' (migration 099) stamps '/venues/<id>' —
  // PLURAL, matching the web app's own route, while this app's screen is
  // singular (src/app/venue/[id].tsx) — the same web/app path-naming
  // mismatch as every other instance of this bug, which is why "the path
  // looks right" is never enough. This is the highest-intent tap in the
  // notification vocabulary: someone requested a court be listed, waited,
  // got told it's live, and the tap dead-ended on the Alerts tab they
  // were already on. Extracted the same way bookingMatch/eventMatch are
  // above; falls through to Alerts (not a /venue/[id] with an undefined
  // param) if the id somehow doesn't parse as a uuid.
  const venueMatch = effectiveUrl.match(/^\/venues\/([0-9a-f-]{36})/i);
  if (venueMatch) {
    return { pathname: '/venue/[id]', params: { id: venueMatch[1] } };
  }

  // Admin notifications (migration 101: '/admin/payouts', '/admin/payouts/
  // <id>') are a deliberate no-op, not an oversight — admins work on the
  // web, and this app has no admin screens at all. Alerts is the honest
  // destination here, unlike every case above this comment.
  if (effectiveUrl.startsWith('/admin')) return '/(tabs)/notifications';

  return '/(tabs)/notifications';
}
