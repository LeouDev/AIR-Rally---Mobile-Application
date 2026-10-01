import * as Notifications from 'expo-notifications';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * The signed-in user's unread notification count, behind both the Alerts
 * tab badge and the app-icon badge. A tiny external store rather than a
 * provider: a few places refresh it (the tab layout on open/foreground,
 * the Alerts screen after reading) and one place shows it.
 *
 * `notifications` isn't in the supabase_realtime publication, so this
 * refreshes on those events rather than live. While the app is closed,
 * the push payload's own `badge` keeps the icon current.
 */
let unreadCount = 0;
let latestRefresh = 0;
const listeners = new Set<() => void>();
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Scoped to the user IN THE QUERY: the SELECT policy also lets admins
 * read everyone's notifications (see the Alerts screen's own note). */
export async function refreshUnreadCount(userId: string | null): Promise<void> {
  // Only the latest-started refresh may write: an older read landing late
  // would put back a count the user has already cleared.
  const refresh = ++latestRefresh;
  let count = 0;
  if (userId) {
    const { count: unread, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);
    // Keep the last known count rather than flashing a false zero.
    if (error) return;
    count = unread ?? 0;
  }
  if (refresh !== latestRefresh) return;

  if (count !== unreadCount) {
    unreadCount = count;
    listeners.forEach((listener) => listener());
  }
  // Every time, not only on change: a push's `badge` may have moved the
  // icon since, and this is the authoritative number.
  if (isNative) Notifications.setBadgeCountAsync(count).catch(() => {});
}

export function useUnreadCount(): number {
  return useSyncExternalStore(subscribe, () => unreadCount);
}

/** "9+" past nine — the tab bar has room for two characters. */
export function unreadBadgeLabel(count: number): string {
  return count > 9 ? '9+' : String(count);
}
