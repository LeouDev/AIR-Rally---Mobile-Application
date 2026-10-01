import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/** The token this device last registered, so sign-out can withdraw it
 * whichever path registered it (sign-in, or a later "Turn on"). */
let registeredToken: string | null = null;

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
 *
 * Asks for permission only with `prompt: true` — from a moment the player
 * can see the point of (offerPushNotifications below). Sign-in used to
 * ask, which spent iOS's one-time prompt with no context, and a reflexive
 * "Don't Allow" there is permanent.
 */
export async function registerDevicePushToken({ prompt = false }: { prompt?: boolean } = {}): Promise<string | null> {
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
    if (!granted && prompt) {
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
    registeredToken = token;
    return token;
  } catch (error) {
    console.warn('Push registration skipped', error);
    return null;
  }
}

/** Sign-out cleanup — must run while the session still exists. */
export async function unregisterDevicePushToken(): Promise<void> {
  const token = registeredToken;
  if (!token) return;
  registeredToken = null;
  try {
    await supabase.rpc('unregister_push_token', { p_token: token });
  } catch (error) {
    console.warn('unregister_push_token failed', error);
  }
}

const OFFER_SHOWN_AT_KEY = 'push-offer-shown-at';
const OFFER_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Offers notifications at a moment they obviously help — a court just
 * booked, a game just joined — instead of at launch or sign-in. A soft ask
 * first: "Not now" leaves iOS's real, one-time prompt unspent, so it's
 * offered again at the next such moment (at most once a day). Only while
 * the player hasn't decided: granted needs nothing, and denied is
 * Settings' to change.
 */
export async function offerPushNotifications(context: string): Promise<void> {
  try {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    if (!Device.isDevice) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'undetermined') return;
    const lastShown = Number(await AsyncStorage.getItem(OFFER_SHOWN_AT_KEY));
    if (lastShown && Date.now() - lastShown < OFFER_INTERVAL_MS) return;
    await AsyncStorage.setItem(OFFER_SHOWN_AT_KEY, String(Date.now()));

    Alert.alert('Turn on notifications?', `${context} We'll tell you if anything changes, and remind you before you play.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Turn on', onPress: () => void registerDevicePushToken({ prompt: true }) },
    ]);
  } catch {
    // Never in the way of the moment it was offered from.
  }
}
