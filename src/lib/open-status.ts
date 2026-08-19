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
 * hours (no booking lookups), so it stays cheap across a whole results grid. */
export function computeOpenStatus(operatingHours: VenueOperatingHours[], timezone: string, now: Date = new Date()): OpenStatus {
  const dayOfWeek = localDayOfWeek(now, timezone);
  const nowMinutes = localMinutesOfDay(now, timezone);
  const today = operatingHours.find((h) => h.day_of_week === dayOfWeek);

  if (!today) {
    return { isOpenNow: false, label: 'Closed today' };
  }

  const startMinutes = toMinutes(today.start_time);
  const endMinutes = toMinutes(today.end_time);

  if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
    return { isOpenNow: true, label: `Open now · closes ${formatHourLabel(endMinutes)}` };
  }
  if (nowMinutes < startMinutes) {
    return { isOpenNow: false, label: `Closed · opens ${formatHourLabel(startMinutes)}` };
  }
  return { isOpenNow: false, label: 'Closed today' };
}
