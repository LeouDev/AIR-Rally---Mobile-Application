import { webPathToAppPath } from '@/lib/deep-link-target';

/**
 * Universal Links hand iOS the WEB path. Three of them name routes this
 * app does not have, so without a rewrite the app opens to "Page not
 * found" and the page the player tapped becomes unreachable — worse than
 * the browser opening, which is the bug this was meant to fix.
 *
 * The refusals matter more than the rewrites. A path rewritten WRONGLY
 * opens a real screen showing the wrong record, and nothing about that
 * looks like an error to the person reading it.
 */

describe('rewrites the shapes web and app disagree on', () => {
  it('maps a web COURT/Side profile to the app player screen, NOT to the post route', () => {
    // The dangerous outcome is passthrough, not a wrong rewrite: the
    // app's /court-side/[postId] takes a POST id, so an unrewritten
    // /court-side/<userId> binds a real screen to the wrong entity.
    // /player/[userId] is the same page under a different name.
    expect(webPathToAppPath('/court-side/user_42')).toBe('/player/user_42');
  });

  it('does NOT swallow /court-side/club/<id>, which already matches the app route', () => {
    // One character of regex separates these two: the single-segment
    // anchor. Without it a club link opens a player profile.
    expect(webPathToAppPath('/court-side/club/c1')).toBe('/court-side/club/c1');
  });

  it('maps a court to the venue screen', () => {
    expect(webPathToAppPath('/courts/abc-123')).toBe('/venue/abc-123');
  });

  it('flattens the ranked match path — web nests it under /match, the app does not', () => {
    expect(webPathToAppPath('/ranked/match/c6a693f3')).toBe('/ranked/c6a693f3');
  });

  it('maps a booking confirmation, which differs in both name and depth', () => {
    expect(webPathToAppPath('/bookings/bk_9/confirmation')).toBe('/booking/bk_9');
  });

  it('accepts the absolute URL form Universal Links actually deliver', () => {
    expect(webPathToAppPath('https://air-rally.com/courts/abc-123')).toBe('/venue/abc-123');
  });

  it('accepts the custom scheme without inventing a host segment', () => {
    expect(webPathToAppPath('airrally://ranked/match/xyz')).toBe('/ranked/xyz');
  });

  it('preserves a query string rather than silently dropping it', () => {
    expect(webPathToAppPath('/courts/abc?ref=email')).toBe('/venue/abc?ref=email');
  });

  it('tolerates a trailing slash', () => {
    expect(webPathToAppPath('/courts/abc/')).toBe('/venue/abc');
  });
});

describe('refuses to rewrite the paths that would open the WRONG record', () => {
  it('leaves /ranked/results/<id> alone — it is not the app match room', () => {
    // The web page is the public, sign-in-free result. /ranked/[matchId]
    // in the app is the live match room and needs a session. Mapping one
    // to the other would send a signed-out recipient to a login wall.
    expect(webPathToAppPath('/ranked/results/m1')).toBe('/ranked/results/m1');
  });

  it('leaves /venues/requests/<id> alone — the app has no such route', () => {
    expect(webPathToAppPath('/venues/requests/r1')).toBe('/venues/requests/r1');
  });
});

describe('passes through the shapes that already agree', () => {
  it.each(['/events/e1', '/clubs/c1', '/court-side/club/c1', '/clubs/new', '/events/new'])(
    'leaves %s unchanged',
    (path) => {
      expect(webPathToAppPath(path)).toBe(path);
    }
  );
});

describe('does not over-match', () => {
  it('ignores /courts with no id', () => {
    expect(webPathToAppPath('/courts')).toBe('/courts');
  });

  it('ignores a deeper court path it was not written for', () => {
    expect(webPathToAppPath('/courts/abc/reviews')).toBe('/courts/abc/reviews');
  });

  it('ignores a booking without the /confirmation leaf', () => {
    // The app's /booking/[id] is the booking detail screen, but the web
    // route this could be confused with does not exist — so passing it
    // through is correct rather than guessing.
    expect(webPathToAppPath('/bookings/bk_9')).toBe('/bookings/bk_9');
  });

  it('ignores /ranked/match with no id', () => {
    expect(webPathToAppPath('/ranked/match')).toBe('/ranked/match');
  });
});

describe('never throws — a tapped link must not be able to crash the app', () => {
  it.each(['', '/', '//', 'not a url', 'https://', '/courts/%%%', 'airrally://'])(
    'survives %p',
    (input) => {
      expect(() => webPathToAppPath(input)).not.toThrow();
    }
  );
});
