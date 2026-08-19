import { condensedSchedule, weeklySchedule } from '@/lib/venues';
import type { VenueOperatingHours } from '@/lib/database.types';

const hours = (day: number, start: string, end: string): VenueOperatingHours => ({
  id: `${day}-${start}`,
  venue_id: 'v',
  day_of_week: day,
  start_time: start,
  end_time: end,
  created_at: '',
  updated_at: '',
});

/** Postgres day_of_week: 0 = Sunday. */
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

describe('weeklySchedule', () => {
  it('reads Monday-first, with Sunday last', () => {
    const rows = ALL_DAYS.map((d) => hours(d, '09:00:00', '17:00:00'));

    expect(weeklySchedule(rows).map((r) => r.day)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
  });

  it('marks days with no row as Closed', () => {
    const schedule = weeklySchedule([hours(1, '09:00:00', '17:00:00')]);

    expect(schedule.find((r) => r.day === 'Monday')?.hours).toBe('9 AM – 5 PM');
    expect(schedule.find((r) => r.day === 'Tuesday')?.hours).toBe('Closed');
  });

  it('joins multiple ranges in a single day', () => {
    const schedule = weeklySchedule([
      hours(1, '13:00:00', '23:00:00'),
      hours(1, '06:00:00', '12:00:00'),
    ]);

    // Sorted by start time regardless of row order.
    expect(schedule.find((r) => r.day === 'Monday')?.hours).toBe('6 AM – 12 PM, 1 PM – 11 PM');
  });

  it('renders minutes only when they are not on the hour', () => {
    const schedule = weeklySchedule([hours(1, '09:30:00', '17:00:00')]);

    expect(schedule.find((r) => r.day === 'Monday')?.hours).toBe('9:30 AM – 5 PM');
  });
});

describe('condensedSchedule', () => {
  it('folds an identical week into a single Daily line', () => {
    const rows = ALL_DAYS.map((d) => hours(d, '06:00:00', '23:00:00'));

    expect(condensedSchedule(rows)).toEqual([{ label: 'Daily', hours: '6 AM – 11 PM' }]);
  });

  it('splits a weekday/weekend schedule into two ranges', () => {
    const rows = [
      ...[1, 2, 3, 4, 5].map((d) => hours(d, '06:00:00', '22:00:00')),
      ...[6, 0].map((d) => hours(d, '08:00:00', '20:00:00')),
    ];

    expect(condensedSchedule(rows)).toEqual([
      { label: 'Mon – Fri', hours: '6 AM – 10 PM' },
      { label: 'Sat – Sun', hours: '8 AM – 8 PM' },
    ]);
  });

  it('names a lone differing day rather than making a range of one', () => {
    const rows = [
      ...[1, 2, 3, 4, 5, 6].map((d) => hours(d, '06:00:00', '22:00:00')),
      hours(0, '08:00:00', '18:00:00'),
    ];

    const condensed = condensedSchedule(rows);
    expect(condensed[1]).toEqual({ label: 'Sunday', hours: '8 AM – 6 PM' });
  });

  it('keeps Closed days visible instead of hiding them', () => {
    const rows = [1, 2, 3, 4, 5].map((d) => hours(d, '06:00:00', '22:00:00'));

    expect(condensedSchedule(rows)).toEqual([
      { label: 'Mon – Fri', hours: '6 AM – 10 PM' },
      { label: 'Sat – Sun', hours: 'Closed' },
    ]);
  });

  it('returns a single Closed line for a venue with no hours at all', () => {
    expect(condensedSchedule([])).toEqual([{ label: 'Daily', hours: 'Closed' }]);
  });
});
