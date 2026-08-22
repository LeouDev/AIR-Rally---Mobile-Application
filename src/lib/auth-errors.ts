/**
 * Translates a raw Supabase Auth error into a sentence written for the
 * player, never the SDK's own wording — "AuthApiError: invalid_credentials"
 * or a raw Postgres message is not something a person mistyping a
 * password should ever see.
 *
 * Matches on `error.code` first — the stable machine-readable string
 * every AuthApiError carries (see @supabase/auth-js's ErrorCode union) —
 * rather than the human-readable `message`, which is prose Supabase is
 * free to reword. A message-text fallback covers older/edge-case errors
 * that arrive without a code at all.
 *
 * The one thing this must NOT do: turn a network failure into "incorrect
 * password". A dropped connection has neither a matching code nor
 * message text, so it falls straight through to the generic fallback —
 * exactly as unrecognised errors do — rather than being guessed at. A
 * wrong-but-confident message is worse than an honest "something went
 * wrong", because it sends the player to reset a password that was
 * never the problem.
 */

type ErrorLike = { message?: string; code?: string };

function asErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === 'object') return error as ErrorLike;
  return {};
}

// Keyed on @supabase/auth-js's ErrorCode strings.
const CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: 'That email or password is incorrect.',
  user_already_exists: 'An account with that email already exists.',
  email_exists: 'An account with that email already exists.',
  email_not_confirmed: 'Please confirm your email before signing in — check your inbox for the confirmation link.',
  over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
  over_email_send_rate_limit: 'Too many attempts. Please wait a moment and try again.',
  session_expired: 'Your session has expired. Please sign in again.',
  session_not_found: 'Your session has expired. Please sign in again.',
  refresh_token_not_found: 'Your session has expired. Please sign in again.',
  weak_password: 'Choose a stronger password.',
  same_password: "That's your current password — choose a different one.",
  user_banned: 'This account is not available. Contact support.',
  signup_disabled: 'Sign-ups are temporarily unavailable. Please try again later.',
};

// Same intent as CODE_MESSAGES, keyed on message text — for an error
// that reached the client without a `code` (some SDK versions/paths
// omit it even for a plain wrong-password rejection).
const MESSAGE_PATTERNS: { test: RegExp; message: string }[] = [
  { test: /invalid login credentials/i, message: CODE_MESSAGES.invalid_credentials },
  { test: /already registered|user already exists|already exists/i, message: CODE_MESSAGES.user_already_exists },
  { test: /email not confirmed/i, message: CODE_MESSAGES.email_not_confirmed },
  { test: /rate limit|too many requests/i, message: CODE_MESSAGES.over_request_rate_limit },
  { test: /jwt expired|invalid refresh token|session (missing|not found)/i, message: CODE_MESSAGES.session_expired },
];

export function getFriendlyAuthErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  const e = asErrorLike(error);
  if (e.code && CODE_MESSAGES[e.code]) return CODE_MESSAGES[e.code];
  const text = e.message ?? '';
  return MESSAGE_PATTERNS.find((p) => p.test.test(text))?.message ?? fallback;
}
