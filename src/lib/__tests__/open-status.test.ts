import { computeOpenStatus } from '@/lib/open-status';
import type { VenueOperatingHours } from '@/lib/database.types';

function operatingHours(dayOfWeek: number, start: string, end: string): VenueOperatingHours {
  return {
    id: `hours-${dayOfWeek}`,
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
});
