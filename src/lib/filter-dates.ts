/**
 * The "Open on" filter's date/time boundary.
 *
 * These exist because the previous free-text implementation had a silent
 * discard: `apply()` regex-tested the typed strings and, on a miss,
 * dropped `availableOn`/`availableAt` without telling anyone. Type
 * "8/24/2026", the sheet closes, no filter is applied, and the active
 * filter count doesn't include it either — so the UI positively asserts
 * nothing is filtered while the player believes they filtered. Same
 * shape as every other quiet-wrongness bug in this codebase: the action
 * appeared to succeed and nothing on screen contradicted it.
 *
 * The fix is structural rather than a validation message. The sheet now
 * holds `Date | null`, so an invalid value cannot be represented at all
 * and `apply()` has no parse step left to drop anything in. These
 * helpers are the only crossing between the wire format (the ISO-ish
 * strings MarketplaceFilters carries) and that state, and both
 * directions are total: parse returns null explicitly, format cannot
 * fail.
 */

/** Local calendar day, NOT toISOString().slice(0, 10).
 *
 * toISOString() converts to UTC first, so a player in Manila (UTC+8)
 * picking "Saturday" any time before 08:00 local would send Friday —
 * the same venue-local-vs-UTC error the owner revenue buckets hit. The
 * filter means the day the player pointed at, in their own calendar. */
export function formatFilterDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatFilterTime(date: Date): string {
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Wire string → Date, or null. Null is a real answer here, never a
 * silent substitution: callers are expected to notice and say so rather
 * than carry on as though no filter had been requested.
 *
 * Constructed from parts rather than `new Date(value)` — the string
 * form of a bare date is parsed as UTC midnight by spec, which lands on
 * the previous day for every timezone west of Greenwich and reintroduces
 * exactly the shift formatFilterDate() avoids.
 */
export function parseFilterDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  // Rejects the overflow the Date constructor performs silently —
  // new Date(2026, 1, 31) is 3 March, which would quietly filter a day
  // the player never chose.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Wire "HH:MM" → a Date on `onDate`, or null. Time is only meaningful
 * alongside a date (the RPC filters a day's operating hours), so the day
 * it belongs to is a required input rather than an implied "today". */
export function parseFilterTime(value: string | undefined | null, onDate: Date): Date | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const date = new Date(onDate);
  date.setHours(hours, minutes, 0, 0);
  return date;
}
