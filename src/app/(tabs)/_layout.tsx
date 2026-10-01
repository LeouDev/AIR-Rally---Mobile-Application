import * as Notifications from 'expo-notifications';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { cancelBookingReminders } from '@/lib/booking-reminders';
import { refreshUnreadCount, unreadBadgeLabel, useUnreadCount } from '@/lib/unread';
import { useSession } from '@/providers/session';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Player-side tabs. SF Symbols carry the iOS icons; Android falls back
 * to label-only until Phase 1 brings drawable assets.
 */
export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const unreadCount = useUnreadCount();

  // The unread count behind the tab and icon badges, refreshed when the
  // tabs mount, whenever the app returns to the foreground, and when a push
  // lands while it's open. Booking reminders an earlier version scheduled
  // on this phone are cleared: the server sends them now.
  useEffect(() => {
    void cancelBookingReminders();
    const refresh = () => void refreshUnreadCount(userId);
    refresh();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const pushReceived = isNative
      ? Notifications.addNotificationReceivedListener(() => void refreshUnreadCount(userId))
      : null;
    return () => {
      appState.remove();
      pushReceived?.remove();
    };
  }, [userId]);

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.accent}
      tintColor={colors.primary}
      labelStyle={{ selected: { color: colors.primary } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'magnifyingglass', selected: 'magnifyingglass' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="bookings">
        <NativeTabs.Trigger.Label>Bookings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'calendar', selected: 'calendar' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="play">
        <NativeTabs.Trigger.Label>Play</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'sportscourt', selected: 'sportscourt.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="notifications">
        <NativeTabs.Trigger.Label>Alerts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bell', selected: 'bell.fill' }} />
        <NativeTabs.Trigger.Badge hidden={unreadCount === 0}>{unreadBadgeLabel(unreadCount)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
