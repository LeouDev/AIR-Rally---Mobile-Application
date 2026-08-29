/**
 * Translates an incoming air-rally.com URL into the route this app can
 * actually render.
 *
 * WHY THIS EXISTS: the website and the app disagree about three URL
 * shapes. Universal Links hand iOS the WEB path, so without a rewrite the
 * app opens and expo-router matches nothing — the player gets "Page not
 * found" and the web page they tapped becomes unreachable. That is worse
 * than the link having opened Safari, which is the bug this was meant to
 * fix. Verified 2026-08-30: `/courts/*` was the only path the live AASA
 * claimed, and the app has no `/courts` route at all.
 *
 *   /courts/<id>                  → /venue/<id>          name differs
 *   /ranked/match/<id>            → /ranked/<id>         depth differs
 *   /bookings/<id>/confirmation   → /booking/<id>        name and depth
 *   /court-side/<userId>          → /player/<userId>     name differs
 *
 * DELIBERATELY NOT REMAPPED, and none of these should ever be added to
 * the AASA either:
 *
 *   /ranked/results/<id>   No app route. The app's /ranked/[matchId] is
 *                          the live match room and requires a session;
 *                          the web page is the public, sign-in-free
 *                          result. They are not the same page.
 *   /venues/requests/<id>  No app route at all.
 *
 * Everything else passes through unchanged, which is correct for the
 * shapes that already agree (/events/*, /clubs/*, /court-side/club/*).
 *
 * ON /court-side/<userId> SPECIFICALLY — it looks like a trap and isn't.
 * The app's /court-side/[postId] takes a POST id, so passing this through
 * would open a real screen bound to the wrong entity. But the app DOES
 * have the equivalent page: /player/[userId] fetches the same five things
 * the web page does (getPublicProfile, listPostsByUser, listLikedPostIds,
 * listResharedPostIds, getFollowCounts). It is a rename, like /courts.
 * The web feed links here constantly — follow lists, post authors,
 * reshare attributions — so leaving it unclaimed would miss one of the
 * most-tapped link shapes in the product. The single-segment anchor below
 * is what keeps /court-side/club/<id> out of it.
 */

/**
 * Splits a path from its query/fragment so a rewrite can't silently drop
 * them — `?ref=` on a shared court link is the sort of thing that goes
 * missing and is never noticed.
 */
function splitSuffix(path: string): { base: string; suffix: string } {
  const cut = path.search(/[?#]/);
  return cut === -1 ? { base: path, suffix: '' } : { base: path.slice(0, cut), suffix: path.slice(cut) };
}

/**
 * Reduces a full URL to its path. Universal Links arrive as absolute
 * https:// URLs; the custom `airrally://` scheme and bare paths also
 * reach here, so all three have to normalise to the same thing.
 */
function toPath(input: string): string {
  if (input.startsWith('/')) return input;
  const schemeEnd = input.indexOf('://');
  if (schemeEnd === -1) return input;

  const scheme = input.slice(0, schemeEnd).toLowerCase();
  const rest = input.slice(schemeEnd + 3);

  // http(s) has a real host to discard. A custom scheme does not — in
  // `airrally://ranked/match/x` there is no host, so `ranked` is the
  // first PATH segment. Treating it as a host (the obvious shared
  // implementation) silently yields `/match/x`, a route that does not
  // exist, and the link dies on not-found. Caught by test rather than by
  // reading: the two URL forms genuinely parse differently.
  if (scheme !== 'http' && scheme !== 'https') {
    return rest.startsWith('/') ? rest : `/${rest}`;
  }

  const slash = rest.indexOf('/');
  return slash === -1 ? '/' : rest.slice(slash);
}

/** A single non-empty path segment containing no slashes. */
const SEG = '([^/?#]+)';

const REWRITES: { pattern: RegExp; to: (m: RegExpMatchArray) => string }[] = [
  { pattern: new RegExp(`^/courts/${SEG}/?$`), to: (m) => `/venue/${m[1]}` },
  { pattern: new RegExp(`^/ranked/match/${SEG}/?$`), to: (m) => `/ranked/${m[1]}` },
  { pattern: new RegExp(`^/bookings/${SEG}/confirmation/?$`), to: (m) => `/booking/${m[1]}` },
  // Single segment only — `/court-side/club/<id>` has two and must fall
  // through to the passthrough, where it already matches the app's route.
  { pattern: new RegExp(`^/court-side/${SEG}/?$`), to: (m) => `/player/${m[1]}` },
];

/**
 * Returns the path this app should open. Never throws: `+native-intent`'s
 * own docs warn that throwing there can crash the app, so the failure
 * mode here is deliberately "hand back what we were given" — the worst
 * case is the not-found screen the user would have seen anyway, not a
 * crash on launch from a tapped link.
 */
export function webPathToAppPath(input: string): string {
  try {
    if (!input) return input;
    const { base, suffix } = splitSuffix(toPath(input));
    for (const { pattern, to } of REWRITES) {
      const match = base.match(pattern);
      if (match) return `${to(match)}${suffix}`;
    }
    return `${base}${suffix}`;
  } catch {
    return input;
  }
}
