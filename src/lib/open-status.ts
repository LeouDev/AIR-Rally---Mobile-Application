import type { VenueOperatingHours } from '@/lib/database.types';

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function localDayOfWeek(instant: Date, timezone: string): number {
  const abbr = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(instant);
  return WEEKDAY_ABBR.indexOf(abbr);
}

function localMinutesOfDay(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function formatHourLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const min = minutes % 60;
  const period = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return min === 0 ? `${hour12}${period}` : `${hour12}:${String(min).padStart(2, '0')}${period}`;
}

export type OpenStatus = {
  isOpenNow: boolean;
  label: string;
};

/** Port of the web's computeOpenStatus — same "Open now · closes 9pm" /
 * "Closed · opens 6am" / "Closed today" labeling, purely from operating
 * hours (no booking lookups), so it stays cheap across a whole results grid.
 *
 * A day can have several windows (unique on venue + day + start_time, e.g.
 * "6 AM – 12 PM, 1 PM – 11 PM"), so all of today's are considered —
 * reading just the first one called a venue with a midday break
 * "Closed today" all afternoon. */
export function computeOpenStatus(operatingHours: VenueOperatingHours[], timezone: string, now: Date = new Date()): OpenStatus {
  const dayOfWeek = localDayOfWeek(now, timezone);
  const nowMinutes = localMinutesOfDay(now, timezone);
  const windows = operatingHours
    .filter((h) => h.day_of_week === dayOfWeek)
    .map((h) => ({ start: toMinutes(h.start_time), end: toMinutes(h.end_time) }))
    .sort((a, b) => a.start - b.start);

  const current = windows.find((w) => nowMinutes >= w.start && nowMinutes < w.end);
  if (current) {
    return { isOpenNow: true, label: `Open now · closes ${formatHourLabel(current.end)}` };
  }
  const next = windows.find((w) => nowMinutes < w.start);
  if (next) {
    return { isOpenNow: false, label: `Closed · opens ${formatHourLabel(next.start)}` };
  }
  return { isOpenNow: false, label: 'Closed today' };
}
