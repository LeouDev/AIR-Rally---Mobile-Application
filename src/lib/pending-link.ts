/**
 * A link that opened the app while nobody was signed in. The session
 * guard sends that person to sign-in and the link's target is lost, so
 * after sign-in they used to land on Explore instead of the event, match
 * or booking they tapped. The incoming path is remembered here and
 * replayed once sign-in completes (see the root layout).
 */
let pending: { path: string; at: number } | null = null;

/** Old enough that replaying it would surprise rather than help. */
const MAX_AGE_MS = 15 * 60_000;

/** Paths that are no destination to come back to. */
const NOT_A_DESTINATION =
  /^\/(?:$|sign-in|sign-up|forgot-password|reset-password|complete-signup|legal|payment-return)(?:[/?#]|$)/;

export function rememberIncomingLink(path: string): void {
  if (NOT_A_DESTINATION.test(path)) return;
  pending = { path, at: Date.now() };
}

/**
 * The remembered link, once, if it arrived after `signedOutSince` (so a
 * link the player already followed while signed in isn't replayed after a
 * later sign-out and sign-in) and recently enough.
 */
export function takePendingLink(signedOutSince: number): string | null {
  const link = pending;
  pending = null;
  if (!link || link.at < signedOutSince || Date.now() - link.at > MAX_AGE_MS) return null;
  return link.path;
}
