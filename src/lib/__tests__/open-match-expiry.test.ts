import { expiresInLabel, minutesUntilExpiry } from '@/lib/open-match';

/**
 * One hour from open_matches.created_at, per the design memo — a
 * client-side preview of the same fixed window the backend's own
 * expiry sweep enforces, never a source of truth on its own.
 */

const CREATED = '2026-08-31T12:00:00.000Z';

it('returns the full window right at creation', () => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  expect(minutesUntilExpiry(CREATED, now)).toBe(60);
});

it('counts down as time passes', () => {
  const now = new Date('2026-08-31T12:17:00.000Z');
  expect(minutesUntilExpiry(CREATED, now)).toBe(43);
});

it('clamps to 0 rather than going negative once past the window', () => {
  const now = new Date('2026-08-31T14:00:00.000Z');
  expect(minutesUntilExpiry(CREATED, now)).toBe(0);
});

it('labels a fresh broadcast with real remaining minutes', () => {
  const now = new Date('2026-08-31T12:17:00.000Z');
  expect(expiresInLabel(CREATED, now)).toBe('Expires in 43m');
});

it('labels the last minute as "Expiring now", not "Expires in 0m"', () => {
  const now = new Date('2026-08-31T13:00:00.000Z');
  expect(expiresInLabel(CREATED, now)).toBe('Expiring now');
});
