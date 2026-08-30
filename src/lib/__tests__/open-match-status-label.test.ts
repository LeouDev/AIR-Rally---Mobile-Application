import { matchStatusLabel } from '@/lib/open-match';

/**
 * Written from the first commit, not retrofitted — c3e772b was the
 * sweep across every OTHER status switch in the app after one shipped
 * with no default and crashed on a status a build didn't recognize.
 * open_matches.status is exactly the same shape: a new client-visible
 * enum value the server can add at any time (see new-enum-value-breaks-
 * old-clients memory).
 */

it('labels every known status', () => {
  expect(matchStatusLabel('open')).toBe('Open');
  expect(matchStatusLabel('converted')).toBe('Full');
  expect(matchStatusLabel('expired')).toBe('Expired');
  expect(matchStatusLabel('cancelled')).toBe('Cancelled');
});

it('returns a real string, not undefined, for a status this build does not recognize', () => {
  const label = matchStatusLabel('archived' as never);
  expect(typeof label).toBe('string');
  expect(label.length).toBeGreaterThan(0);
});
