import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { resolveNotificationTarget } from '@/lib/notification-links';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

// Foreground presentation: without a handler iOS silently swallows
// pushes that arrive while the app is open. Banner + list, no sound —
// an in-app arrival shouldn't ring like a lock-screen one.
if (isNative) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function openFromNotification(response: Notifications.NotificationResponse): void {
  // Expo-delivered pushes surface our webhook's { url, notificationId }
  // directly as content.data; a raw APNS delivery (simctl, other
  // senders) can leave it nested under the payload's "body" key — accept
  // both rather than depending on who did the delivering.
  const data = response.notification.request.content.data as
    | { url?: string; body?: { url?: string } }
    | null;
  const url = data?.url ?? data?.body?.url;
  console.log('[notifications] tap ->', JSON.stringify(url ?? null));
  router.push(resolveNotificationTarget(url));
}

/**
 * Routes notification taps — both while the app runs and the tap that
 * cold-started it (fetched once via getLastNotificationResponseAsync;
 * the root layout only mounts the navigator after the session loads, so
 * by the time this effect runs the router can accept the push).
 */
export function useNotificationObserver(): void {
  useEffect(() => {
    if (!isNative) return;

    // Presentation permission, asked once (only while undetermined — a
    // "no" is respected). The token-registration path also asks, but it
    // exits early on simulators, which would leave dev builds unable to
    // show any banner at all.
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status === 'undetermined') {
        Notifications.requestPermissionsAsync();
      }
    });

    let coldStartHandled = false;

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && !coldStartHandled) {
        coldStartHandled = true;
        openFromNotification(response);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      coldStartHandled = true;
      openFromNotification(response);
    });
    return () => subscription.remove();
  }, []);
}
