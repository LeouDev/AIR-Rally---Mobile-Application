import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Registers this device for push and records its Expo token via the
 * register_push_token RPC (see the web repo's migration
 * 20260810000065_device_push_tokens.sql — the RPC owns the writes; there
 * is deliberately no direct INSERT path).
 *
 * Best-effort by design, mirroring the backend's fail-open posture:
 * push is an add-on to in-app notifications, so nothing here may break
 * sign-in. Returns the token when registration happened, null when it
 * couldn't — simulators, Expo Go (remote push unsupported), declined
 * permission, or no EAS projectId yet (dev builds get one from
 * `eas init`; until then this is a graceful no-op).
 */
export async function registerDevicePushToken(): Promise<string | null> {
  try {
    // Platform first: on web, expo-device reports isDevice=true, so the
    // old ordering fell through to notification APIs that warn on web.
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
    if (!Device.isDevice) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status } = await Notifications.getPermissionsAsync();
    let granted = status === 'granted';
    if (!granted) {
      const request = await Notifications.requestPermissionsAsync();
      granted = request.status === 'granted';
    }
    if (!granted) return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
    });
    if (error) {
      console.warn('register_push_token failed', error.message);
      return null;
    }
    return token;
  } catch (error) {
    console.warn('Push registration skipped', error);
    return null;
  }
}

/** Sign-out cleanup — must run while the session still exists. */
export async function unregisterDevicePushToken(token: string): Promise<void> {
  try {
    await supabase.rpc('unregister_push_token', { p_token: token });
  } catch (error) {
    console.warn('unregister_push_token failed', error);
  }
}
