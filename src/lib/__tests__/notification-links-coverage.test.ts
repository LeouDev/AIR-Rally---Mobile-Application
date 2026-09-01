import { INTENTIONALLY_UNROUTED, resolveNotificationTarget, TYPE_FALLBACK } from '@/lib/notification-links';

/**
 * The structural fix, not another instance of the fix. Four notification
 * types (Open Match's broadcast, venue-listed, and — before either of
 * those — post-engagement and support replies) shipped dead-ending on
 * the Alerts tab before anyone noticed, each found by a manual grep
 * rather than anything that would catch the next one. This is that
 * catch: it fails the day someone adds a notification type on the
 * database side without a route on the app side, which is exactly how
 * all four happened.
 *
 * Canonical list below is a CTO audit, 2026-09-01: every `insert into
 * public.notifications` across all migrations, keyed by type, keeping
 * only each type's HIGHEST-numbered migration (a later trigger replaces
 * an earlier one's definition — an earlier, naive pass that skipped
 * this step produced 21 false "missing" types). If this list goes
 * stale, the fix is to re-run that audit, not to guess.
 */

// One representative link_url per prefix currently in use, keyed by an
// example notification type that stamps it. `/confirmation` isn't its
// own case in the resolver — booking_confirmed's full path is
// '/bookings/<uuid>/confirmation', already caught by the /bookings
// regex — so it's exercised via that full path, not a bare prefix.
const LINK_PREFIX_EXAMPLES: Record<string, string> = {
  ranked_match_found: '/ranked/match/3bff1573-28a8-44b5-87bb-3077743b7290',
  ranked_calibration_complete: '/ranked',
  open_match_found: '/ranked/open/3bff1573-28a8-44b5-87bb-3077743b7290',
  event_join_approved: '/events/3bff1573-28a8-44b5-87bb-3077743b7290',
  venue_requested_listed: '/venues/3bff1573-28a8-44b5-87bb-3077743b7290',
  support_request_resolved: '/support',
  booking_confirmed: '/bookings/3bff1573-28a8-44b5-87bb-3077743b7290/confirmation',
  // admin types are the one deliberate exception among the link-bearing
  // types — see the /admin case's own comment in notification-links.ts.
};

// Every notification type with NO link_url in its current (highest-
// migration) definition. Anything in this list MUST be covered by
// either TYPE_FALLBACK or INTENTIONALLY_UNROUTED — there is no third
// option, since resolveNotificationTarget has nothing else to go on.
const TYPES_WITH_NO_LINK_URL = [
  'post_liked',
  'post_reshared',
  'post_mention',
  'booking_cancelled',
  'booking_created',
  'booking_received',
  'reschedule_completed',
  'credits_added',
  'venue_approved',
  'venue_rejected',
  'review_received',
  'club_approved',
  'club_join_request',
  'club_membership_approved',
  'club_suspended',
  'email_confirmed',
];

describe('every known link_url prefix resolves to a real destination', () => {
  it.each(Object.entries(LINK_PREFIX_EXAMPLES))('%s (%s) does not dead-end on Alerts', (_type, url) => {
    expect(resolveNotificationTarget(url)).not.toBe('/(tabs)/notifications');
  });

  it('admin notifications are the one deliberate exception among link-bearing types', () => {
    // Confirms this is a documented decision (see the /admin case's own
    // comment), not the same kind of unwritten accident as the other 13.
    expect(resolveNotificationTarget('/admin/payouts')).toBe('/(tabs)/notifications');
  });
});

describe('every type with no link_url is either routed or explicitly documented as unrouted', () => {
  it.each(TYPES_WITH_NO_LINK_URL)('%s has a TYPE_FALLBACK entry or is in INTENTIONALLY_UNROUTED', (type) => {
    const covered = type in TYPE_FALLBACK || INTENTIONALLY_UNROUTED.has(type);
    expect(covered).toBe(true);
  });

  it('a type with neither is not silently safe — it dead-ends on Alerts same as an unmapped link_url', () => {
    expect(resolveNotificationTarget(null, 'some_new_type_nobody_has_wired_up_yet')).toBe('/(tabs)/notifications');
  });
});
