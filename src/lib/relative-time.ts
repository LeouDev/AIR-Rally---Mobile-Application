/**
 * Short relative timestamps for notification rows ("2h", "Yesterday",
 * "Aug 12"). Deliberately terse: it sits at the end of a title line and
 * must never wrap or push the title out.
 *
 * Anything older than a week gets an absolute date instead — "9d" stops
 * being meaningful long before it stops being accurate.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  // Clock skew, or a row written a moment ago — never render "-3s".
  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d`;

  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(then);
}
