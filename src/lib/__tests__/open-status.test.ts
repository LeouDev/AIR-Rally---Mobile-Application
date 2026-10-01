import { computeOpenStatus } from '@/lib/open-status';
import type { VenueOperatingHours } from '@/lib/database.types';

function operatingHours(dayOfWeek: number, start: string, end: string): VenueOperatingHours {
  return {
    id: `hours-${dayOfWeek}-${start}`,
    venue_id: 'venue-1',
    day_of_week: dayOfWeek,
    start_time: start,
    end_time: end,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('computeOpenStatus', () => {
  it("reports open now with a closing time, when within today's window", () => {
    const now = new Date('2026-08-16T10:30:00Z');
    const hours = [operatingHours(now.getUTCDay(), '06:00', '22:00')];
    expect(computeOpenStatus(hours, 'UTC', now)).toEqual({ isOpenNow: true, label: 'Open now · closes 10pm' });
  });

  it("reports closed with an opening time, when before today's window", () => {
    const now = new Date('2026-08-16T03:00:00Z');
    const hours = [operatingHours(now.getUTCDay(), '06:00', '22:00')];
    expect(computeOpenStatus(hours, 'UTC', now)).toEqual({ isOpenNow: false, label: 'Closed · opens 6am' });
  });

  it("reports closed today, when after today's window", () => {
    const now = new Date('2026-08-16T23:00:00Z');
    const hours = [operatingHours(now.getUTCDay(), '06:00', '22:00')];
    expect(computeOpenStatus(hours, 'UTC', now)).toEqual({ isOpenNow: false, label: 'Closed today' });
  });

  it('reports closed today, when no operating-hours row exists for today', () => {
    const now = new Date('2026-08-16T10:00:00Z');
    const otherDay = (now.getUTCDay() + 1) % 7;
    const hours = [operatingHours(otherDay, '06:00', '22:00')];
    expect(computeOpenStatus(hours, 'UTC', now)).toEqual({ isOpenNow: false, label: 'Closed today' });
  });

  it('formats a half-hour closing/opening time', () => {
    const now = new Date('2026-08-16T10:00:00Z');
    const hours = [operatingHours(now.getUTCDay(), '06:30', '21:30')];
    expect(computeOpenStatus(hours, 'UTC', now)).toEqual({ isOpenNow: true, label: 'Open now · closes 9:30pm' });
  });

  // A day can have several windows. Reading only the first one called a
  // venue with a midday break "Closed today" for the whole afternoon.
  it('is open during the second of two windows in a day', () => {
    const now = new Date('2026-08-16T15:00:00Z');
    const day = now.getUTCDay();
    const hours = [operatingHours(day, '06:00', '12:00'), operatingHours(day, '13:00', '23:00')];
    expect(computeOpenStatus(hours, 'UTC', now)).toEqual({ isOpenNow: true, label: 'Open now · closes 11pm' });
  });

  it('names the next opening during a midday break', () => {
    const now = new Date('2026-08-16T12:30:00Z');
    const day = now.getUTCDay();
    const hours = [operatingHours(day, '06:00', '12:00'), operatingHours(day, '13:00', '23:00')];
    expect(computeOpenStatus(hours, 'UTC', now)).toEqual({ isOpenNow: false, label: 'Closed · opens 1pm' });
  });
});
