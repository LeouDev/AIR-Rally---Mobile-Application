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

  it('sends credit and profile links to Profile', () => {
    expect(resolveNotificationTarget('/profile/credits')).toBe('/(tabs)/profile');
  });

  it('lands web-only surfaces on Alerts instead of a dead end', () => {
    // Court Side, clubs and events have no mobile screen yet — routing to
    // a nonexistent path would strand the user.
    expect(resolveNotificationTarget('/court-side')).toBe('/(tabs)/notifications');
    expect(resolveNotificationTarget('/clubs')).toBe('/(tabs)/notifications');
    expect(resolveNotificationTarget('/events/abc')).toBe('/(tabs)/notifications');
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
});
