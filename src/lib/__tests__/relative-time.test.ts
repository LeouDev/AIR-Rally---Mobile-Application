import { formatRelativeTime } from '@/lib/relative-time';

const NOW = new Date('2026-08-19T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it('says "Just now" under a minute', () => {
    expect(formatRelativeTime(ago(30_000), NOW)).toBe('Just now');
  });

  it('never renders a negative age when the clock is skewed ahead', () => {
    expect(formatRelativeTime(ago(-5_000), NOW)).toBe('Just now');
  });

  it('counts minutes, then hours', () => {
    expect(formatRelativeTime(ago(5 * MINUTE), NOW)).toBe('5m');
    expect(formatRelativeTime(ago(59 * MINUTE), NOW)).toBe('59m');
    expect(formatRelativeTime(ago(2 * HOUR), NOW)).toBe('2h');
    expect(formatRelativeTime(ago(23 * HOUR), NOW)).toBe('23h');
  });

  it('names yesterday rather than saying "1d"', () => {
    expect(formatRelativeTime(ago(DAY), NOW)).toBe('Yesterday');
  });

  it('counts days up to a week', () => {
    expect(formatRelativeTime(ago(3 * DAY), NOW)).toBe('3d');
    expect(formatRelativeTime(ago(6 * DAY), NOW)).toBe('6d');
  });

  it('switches to an absolute date once "Nd" stops being meaningful', () => {
    expect(formatRelativeTime(ago(7 * DAY), NOW)).toBe('Aug 12');
    expect(formatRelativeTime(ago(60 * DAY), NOW)).toBe('Jun 20');
  });
});
