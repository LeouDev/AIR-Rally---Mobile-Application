import { expiresInLabel, minutesUntilExpiry } from '@/lib/open-match';

/**
 * Migration 119: expiry moved from a fixed 60-minute window after
 * created_at to exactly scheduled_at, no grace period. A match can now
 * be posted days ahead of when it's happening (a Tuesday broadcast for
 * a Saturday game), so the label has to scale — minutes close in, hours
 * and days further out — rather than a pure minute count that would
 * read "Expires in 4320m" for anything more than a few hours away.
 */

const SCHEDULED = '2026-08-31T13:00:00.000Z';

it('counts minutes remaining when close to the scheduled time', () => {
  const now = new Date('2026-08-31T12:43:00.000Z');
  expect(minutesUntilExpiry(SCHEDULED, now)).toBe(17);
});

it('clamps to 0 rather than going negative once past scheduled_at', () => {
  const now = new Date('2026-08-31T14:00:00.000Z');
  expect(minutesUntilExpiry(SCHEDULED, now)).toBe(0);
});

it('labels a close-in match with real remaining minutes', () => {
  const now = new Date('2026-08-31T12:43:00.000Z');
  expect(expiresInLabel(SCHEDULED, now)).toBe('Expires in 17m');
});

it('labels the last minute as "Expiring now", not "Expires in 0m"', () => {
  const now = new Date('2026-08-31T13:00:00.000Z');
  expect(expiresInLabel(SCHEDULED, now)).toBe('Expiring now');
});

it('labels a match hours out in hours, not a triple-digit minute count', () => {
  const now = new Date('2026-08-31T07:00:00.000Z'); // 6h before SCHEDULED
  expect(expiresInLabel(SCHEDULED, now)).toBe('Expires in 6h');
});

it('labels a match days out in days, not hours', () => {
  const farOut = '2026-09-06T13:00:00.000Z'; // Saturday, posted the Tuesday before
  const now = new Date('2026-09-03T13:00:00.000Z'); // 3 days before
  expect(expiresInLabel(farOut, now)).toBe('Expires in 3d');
});
