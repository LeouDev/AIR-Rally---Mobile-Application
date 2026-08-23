import { formatFilterDate, formatFilterTime, parseFilterDate, parseFilterTime } from '@/lib/filter-dates';

describe('filter date/time boundary', () => {
  describe('parseFilterDate', () => {
    it('parses an ISO calendar day', () => {
      const parsed = parseFilterDate('2026-08-24');
      expect(parsed).not.toBeNull();
      expect(formatFilterDate(parsed!)).toBe('2026-08-24');
    });

    it('returns null — explicitly — for the formats a player actually types', () => {
      // The exact input that produced the silent-discard bug, plus its
      // near neighbours. Null is the contract: the caller has to notice.
      expect(parseFilterDate('8/24/2026')).toBeNull();
      expect(parseFilterDate('Aug 24')).toBeNull();
      expect(parseFilterDate('24-08-2026')).toBeNull();
      expect(parseFilterDate('2026-8-4')).toBeNull();
      expect(parseFilterDate('tomorrow')).toBeNull();
      expect(parseFilterDate('')).toBeNull();
      expect(parseFilterDate(undefined)).toBeNull();
      expect(parseFilterDate(null)).toBeNull();
    });

    it('rejects a real-looking date that does not exist', () => {
      // new Date(2026, 1, 31) silently becomes 3 March. Passing that
      // through would filter a day the player never chose.
      expect(parseFilterDate('2026-02-31')).toBeNull();
      expect(parseFilterDate('2026-13-01')).toBeNull();
      expect(parseFilterDate('2026-00-10')).toBeNull();
    });

    it('keeps a leap day that does exist', () => {
      expect(parseFilterDate('2028-02-29')).not.toBeNull();
      expect(parseFilterDate('2027-02-29')).toBeNull();
    });
  });

  describe('formatFilterDate', () => {
    it('formats the local calendar day, not the UTC one', () => {
      // 00:30 local. toISOString().slice(0, 10) would report the
      // PREVIOUS day for any timezone east of Greenwich — the same
      // venue-local-vs-UTC error the owner revenue buckets hit. The
      // filter means the day the player pointed at.
      const justAfterMidnight = new Date(2026, 7, 24, 0, 30, 0, 0);
      expect(formatFilterDate(justAfterMidnight)).toBe('2026-08-24');

      const lateEvening = new Date(2026, 7, 24, 23, 45, 0, 0);
      expect(formatFilterDate(lateEvening)).toBe('2026-08-24');
    });

    it('zero-pads single-digit months and days', () => {
      expect(formatFilterDate(new Date(2026, 0, 5, 12, 0, 0, 0))).toBe('2026-01-05');
    });

    it('round-trips with parseFilterDate', () => {
      const iso = '2026-12-31';
      expect(formatFilterDate(parseFilterDate(iso)!)).toBe(iso);
    });
  });

  describe('parseFilterTime', () => {
    const day = new Date(2026, 7, 24, 12, 0, 0, 0);

    it('parses a 24-hour time onto the given day', () => {
      const parsed = parseFilterTime('18:30', day);
      expect(parsed).not.toBeNull();
      expect(formatFilterTime(parsed!)).toBe('18:30');
      // Lands on the day it was given, not "today".
      expect(formatFilterDate(parsed!)).toBe('2026-08-24');
    });

    it('returns null for times that are not times', () => {
      expect(parseFilterTime('6pm', day)).toBeNull();
      expect(parseFilterTime('25:00', day)).toBeNull();
      expect(parseFilterTime('12:60', day)).toBeNull();
      expect(parseFilterTime('', day)).toBeNull();
      expect(parseFilterTime(undefined, day)).toBeNull();
    });

    it('accepts a single-digit hour', () => {
      expect(formatFilterTime(parseFilterTime('9:05', day)!)).toBe('09:05');
    });
  });
});
