import { renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { useNotificationObserver } from '@/lib/notifications-runtime';

/**
 * The observer used to ask for push permission the moment the app first
 * opened — before sign-in, with no reason given. On a real phone it must
 * not; the simulator keeps the ask so dev builds can show banners.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn(), dismissTo: jest.fn() } }));
let mockIsDevice = true;
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockIsDevice;
  },
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

it('does not ask for push permission on launch on a real phone', async () => {
  mockIsDevice = true;
  await renderHook(() => useNotificationObserver());
  await new Promise<void>((resolve) => setImmediate(() => resolve()));

  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

it('still asks on a simulator, so dev builds can show banners', async () => {
  mockIsDevice = false;
  await renderHook(() => useNotificationObserver());
  await new Promise<void>((resolve) => setImmediate(() => resolve()));

  expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
});
