import { redirectSystemPath } from '@/app/+native-intent';
import { rememberIncomingLink, takePendingLink } from '@/lib/pending-link';

/**
 * A link that opens the app while nobody is signed in is swapped for the
 * sign-in screen by the session guard, and its target used to be lost —
 * the player signed in and landed on Explore. The link is remembered and
 * handed back once, if it's still relevant.
 */

const T0 = new Date('2026-10-01T10:00:00Z').getTime();

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(T0);
  takePendingLink(0); // start empty
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('hands back a link that arrived while signed out, exactly once', () => {
  rememberIncomingLink('/events/e1');
  expect(takePendingLink(0)).toBe('/events/e1');
  expect(takePendingLink(0)).toBeNull();
});

it('does not replay a link the player followed before they signed out', () => {
  rememberIncomingLink('/events/e1'); // followed while signed in
  const signedOutAt = T0 + 60_000;
  expect(takePendingLink(signedOutAt)).toBeNull();
});

it('drops a link too old to be what they still want', () => {
  rememberIncomingLink('/events/e1');
  jest.spyOn(Date, 'now').mockReturnValue(T0 + 16 * 60_000);
  expect(takePendingLink(0)).toBeNull();
});

it.each(['/', '/sign-in', '/reset-password?code=x', '/legal/terms', '/payment-return'])(
  'never treats %s as somewhere to come back to',
  (path) => {
    rememberIncomingLink(path);
    expect(takePendingLink(0)).toBeNull();
  }
);

it('records the rewritten app path for every incoming link', () => {
  expect(redirectSystemPath({ path: 'https://air-rally.com/ranked/match/m1', initial: true })).toBe('/ranked/m1');
  expect(takePendingLink(0)).toBe('/ranked/m1');
});
