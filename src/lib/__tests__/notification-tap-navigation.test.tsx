import { renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { useNotificationObserver } from '@/lib/notifications-runtime';

/**
 * A push tapped while some screen is stacked above the tabs (a venue, a
 * match) used router.push() for every target. For a TAB target that
 * builds a second tab bar under the open screen — see
 * tab-return-navigation.test. Tabs are dismissed back to; real screens
 * are still pushed.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn(), dismissTo: jest.fn() } }));

let mockOnTap: (response: unknown) => void = () => {};
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn((listener: (response: unknown) => void) => {
    mockOnTap = listener;
    return { remove: jest.fn() };
  }),
}));

function tap(url: string) {
  mockOnTap({ notification: { request: { content: { data: { url } } } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

it('dismisses back to the Bookings tab instead of pushing a second tab bar', async () => {
  await renderHook(() => useNotificationObserver());
  tap('/bookings');

  expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/bookings');
  expect(router.push).not.toHaveBeenCalled();
});

it('still pushes a real screen, like a specific booking', async () => {
  await renderHook(() => useNotificationObserver());
  tap('/bookings/3bff1573-28a8-44b5-87bb-3077743b7290');

  expect(router.push).toHaveBeenCalledWith({
    pathname: '/booking/[id]',
    params: { id: '3bff1573-28a8-44b5-87bb-3077743b7290' },
  });
  expect(router.dismissTo).not.toHaveBeenCalled();
  expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
});
