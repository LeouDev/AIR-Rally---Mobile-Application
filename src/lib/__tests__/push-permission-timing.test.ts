import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';

import { offerPushNotifications, registerDevicePushToken, unregisterDevicePushToken } from '@/lib/push';
import { supabase } from '@/lib/supabase';

/**
 * Push permission used to be asked on first launch (before sign-in) and
 * again at sign-in — iOS's one-time prompt spent with no context, where a
 * reflexive "Don't Allow" is permanent. Now sign-in only registers if
 * notifications are already allowed, and the ask comes at a moment that
 * explains it, behind a soft "Turn on / Not now" that leaves the real
 * prompt unspent.
 */

jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { eas: { projectId: 'project-1' } } } }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[abc]' })),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(async () => ({ error: null })) } }));

const notifications = Notifications as unknown as Record<string, jest.Mock>;

function softAskButton(label: string) {
  const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as { text: string; onPress?: () => void }[];
  return buttons.find((b) => b.text === label);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('registers at sign-in only if notifications are already allowed — it never asks', async () => {
  notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });

  await expect(registerDevicePushToken()).resolves.toBeNull();
  expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

it('offers notifications with a soft ask, and only "Turn on" brings up the real prompt', async () => {
  notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });

  await offerPushNotifications('Your court is booked.');

  expect(Alert.alert).toHaveBeenCalledWith('Turn on notifications?', expect.stringContaining('Your court is booked.'), expect.any(Array));
  softAskButton('Not now')?.onPress?.();
  expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();

  softAskButton('Turn on')?.onPress?.();
  await new Promise<void>((resolve) => setImmediate(() => resolve()));
  expect(notifications.requestPermissionsAsync).toHaveBeenCalled();
});

it('does not repeat the soft ask within a day', async () => {
  notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });

  await offerPushNotifications('Your court is booked.');
  await offerPushNotifications("You're in this game.");

  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

it.each(['granted', 'denied'])('stays out of the way once the player has decided (%s)', async (status) => {
  notifications.getPermissionsAsync.mockResolvedValue({ status });

  await offerPushNotifications('Your court is booked.');

  expect(Alert.alert).not.toHaveBeenCalled();
});

it('withdraws the token this device registered when the player signs out', async () => {
  notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  await registerDevicePushToken();

  await unregisterDevicePushToken();

  expect(supabase.rpc).toHaveBeenCalledWith('unregister_push_token', { p_token: 'ExponentPushToken[abc]' });
});
