import { resolveNotificationTarget } from '@/lib/notification-links';

/**
 * Covers the routing half of notification taps. The tap gesture itself
 * needs a human (automated taps lose the race with the banner), but the
 * mapping from the web app's URL vocabulary onto app routes is pure and
 * belongs under test — a wrong mapping sends someone to the wrong screen
 * from a push, which is worse than not routing at all.
 */
describe('resolveNotificationTarget', () => {
  it('opens a specific booking when the link carries its id', () => {
    expect(resolveNotificationTarget('/bookings/3bff1573-28a8-44b5-87bb-3077743b7290')).toEqual({
      pathname: '/booking/[id]',
      params: { id: '3bff1573-28a8-44b5-87bb-3077743b7290' },
    });
  });

  it('falls back to the Bookings tab for the bare bookings link', () => {
    expect(resolveNotificationTarget('/bookings')).toBe('/(tabs)/bookings');
  });

  it('sends owner links to the owner dashboard', () => {
    expect(resolveNotificationTarget('/list-your-court/bookings')).toBe('/owner');
  });

  it('sends a payout-sent link to the owner dashboard scrolled to Settlements', () => {
    expect(resolveNotificationTarget('/list-your-court/earnings')).toEqual({
      pathname: '/owner',
      params: { highlight: 'settlements' },
    });
  });

  it('sends credit and profile links to Profile', () => {
    expect(resolveNotificationTarget('/profile/credits')).toBe('/(tabs)/profile');
  });

  it('lands web-only surfaces on Alerts instead of a dead end', () => {
    // Clubs has no mobile screen yet — routing to a nonexistent path would
    // strand the user. (Court Side used to be in this list too, until it
    // shipped a real screen — see the /court-side test below.)
    expect(resolveNotificationTarget('/clubs')).toBe('/(tabs)/notifications');
    expect(resolveNotificationTarget('/events/abc')).toBe('/(tabs)/notifications');
  });

  it('sends Court Side notifications to the feed, not Alerts', () => {
    expect(resolveNotificationTarget('/court-side')).toBe('/court-side');
  });

  it('falls back on notification type when a row has no link_url', () => {
    // post_liked/post_reshared/post_mention are written without a
    // link_url (20260810000032_post_reshares_and_engagement_notifications.sql)
    // — the Alerts list must not go silent for these just because the DB
    // row has nothing in link_url.
    expect(resolveNotificationTarget(null, 'post_liked')).toBe('/court-side');
    expect(resolveNotificationTarget(null, 'post_reshared')).toBe('/court-side');
    expect(resolveNotificationTarget(null, 'post_mention')).toBe('/court-side');
  });

  it('prefers a real link_url over the type fallback', () => {
    expect(resolveNotificationTarget('/bookings', 'post_liked')).toBe('/(tabs)/bookings');
  });

  it('ignores the type fallback for types with no mapping', () => {
    expect(resolveNotificationTarget(null, 'booking_confirmed')).toBe('/(tabs)/notifications');
  });

  it('handles a missing link', () => {
    expect(resolveNotificationTarget(null)).toBe('/(tabs)/notifications');
    expect(resolveNotificationTarget(undefined)).toBe('/(tabs)/notifications');
    expect(resolveNotificationTarget('')).toBe('/(tabs)/notifications');
  });

  it('does not mistake a bookings-prefixed path for a booking id', () => {
    // "/bookings/history" is not a uuid; it must not become /booking/[id].
    expect(resolveNotificationTarget('/bookings/history')).toBe('/(tabs)/bookings');
  });

  it('opens a specific event when the link carries its id', () => {
    // event_join_request/event_registration/event_join_approved/
    // event_join_declined/waitlist_promoted (20260810000073) all stamp
    // this — previously null, so every one of these notifications fell
    // through to the Alerts tab with no destination at all.
    expect(resolveNotificationTarget('/events/3bff1573-28a8-44b5-87bb-3077743b7290')).toEqual({
      pathname: '/events/[id]',
      params: { id: '3bff1573-28a8-44b5-87bb-3077743b7290' },
    });
  });

  it('opens a specific ranked match when the link carries its id', () => {
    expect(resolveNotificationTarget('/ranked/match/3bff1573-28a8-44b5-87bb-3077743b7290')).toEqual({
      pathname: '/ranked/[matchId]',
      params: { matchId: '3bff1573-28a8-44b5-87bb-3077743b7290' },
    });
  });

  // apply_ranked_result() stamps a bare '/ranked' link_url on every
  // rank-change notification (calibration complete, tier/pip up or down).
  // There is no page at that exact path on either app — this app has no
  // dedicated rank screen at all — so it lands on Profile, where RankCard
  // actually renders a player's standing.
  it('sends rank-change notifications to Profile, not the dead bare /ranked link', () => {
    expect(resolveNotificationTarget('/ranked')).toBe('/(tabs)/profile');
    expect(resolveNotificationTarget('/ranked?x=1')).toBe('/(tabs)/profile');
  });

  // notify_on_support_resolution (20260810000088) stamps '/support' on
  // every support reply. With no mapping this fell through to the Alerts
  // tab — the screen the user was already on — so tapping the
  // notification navigated successfully to nowhere and looked broken.
  it('opens the support screen for a support reply, not the Alerts tab it came from', () => {
    expect(resolveNotificationTarget('/support')).toBe('/support');
  });

  // create_open_match (migration 119) stamps '/ranked/open/<id>' on the
  // broadcast notification sent to everyone in the host's city — the
  // feature's entire discovery path. With no mapping this fell through to
  // the Alerts tab the user was already on: the tap that's supposed to
  // bring people INTO Open Match appeared to do nothing. Shipped live on
  // build-16 production for ~20 minutes before this fix.
  it('sends an open-match broadcast link to the Play tab, not the Alerts tab it dead-ended on', () => {
    // The discriminating assertion: pin what the OLD/broken behavior
    // actually was, so a regression back to "unmapped, falls through to
    // notifications" fails here specifically rather than only failing to
    // match the new mapping (which a still-unreachable case would also do).
    expect(resolveNotificationTarget('/ranked/open/3bff1573-28a8-44b5-87bb-3077743b7290')).not.toBe('/(tabs)/notifications');
    expect(resolveNotificationTarget('/ranked/open/3bff1573-28a8-44b5-87bb-3077743b7290')).toBe('/(tabs)/play');
  });

  // venue_requested_listed (migration 099) stamps '/venues/<id>' — plural,
  // matching the web app's own route, while this app's screen is singular
  // (src/app/venue/[id].tsx). The highest-intent tap in the notification
  // vocabulary: someone requested a court, waited, got told it's live, and
  // the tap dead-ended on the Alerts tab they were already on.
  it('opens the specific venue when a listing notification carries its id, not the plural web path', () => {
    expect(resolveNotificationTarget('/venues/3bff1573-28a8-44b5-87bb-3077743b7290')).not.toBe('/(tabs)/notifications');
    expect(resolveNotificationTarget('/venues/3bff1573-28a8-44b5-87bb-3077743b7290')).toEqual({
      pathname: '/venue/[id]',
      params: { id: '3bff1573-28a8-44b5-87bb-3077743b7290' },
    });
  });

  it('falls through to Alerts rather than a /venue/[id] with an undefined param when the id does not parse as a uuid', () => {
    expect(resolveNotificationTarget('/venues/not-a-uuid')).toBe('/(tabs)/notifications');
  });

  // migration 101's admin notifications ('/admin/payouts', '/admin/payouts/
  // <id>') are a deliberate no-op — admins work on the web, this app has
  // no admin screens. Written down as a decision, not left to be
  // rediscovered as an accident the way the other four cases were.
  it('leaves admin notifications on Alerts — deliberate, this app has no admin screens', () => {
    expect(resolveNotificationTarget('/admin/payouts')).toBe('/(tabs)/notifications');
    expect(resolveNotificationTarget('/admin/payouts/3bff1573-28a8-44b5-87bb-3077743b7290')).toBe(
      '/(tabs)/notifications'
    );
  });

  it('still lands somewhere real for a link this app genuinely has no screen for', () => {
    // Clubs detail exists here, but an unmapped web-only surface must
    // not resolve to a route that does not exist.
    expect(resolveNotificationTarget('/admin/payouts/abc')).toBe('/(tabs)/notifications');
  });
});
