import { render } from '@testing-library/react-native';
import React from 'react';

import RootLayout from '@/app/_layout';
import { useNotificationObserver } from '@/lib/notifications-runtime';

/**
 * A push tapped while the app is closed cold-starts it, and
 * getLastNotificationResponseAsync() hands that tap back within
 * milliseconds. The navigator, though, is held back until the session
 * AND its agreement check resolve — a network round trip. When the
 * observer lived in RootNavigator above that gate, it routed before any
 * navigator existed, expo-router threw "Attempted to navigate before
 * mounting the Root Layout component", and the tap never reached its
 * screen. These pin that nothing listens for taps until the navigator
 * is actually being mounted.
 */

let mockSessionState: { session: unknown; isLoaded: boolean; needsAgreement: boolean | null } = {
  session: null,
  isLoaded: false,
  needsAgreement: null,
};

function MockPassthrough({ children }: { children: React.ReactNode }) {
  return children;
}

jest.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Protected = function Protected() {
    return null;
  };
  Stack.Screen = function Screen() {
    return null;
  };
  return { Stack, ThemeProvider: MockPassthrough, DarkTheme: { colors: {} }, DefaultTheme: { colors: {} } };
});
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/sentry', () => ({ initSentry: jest.fn() }));
jest.mock('@/lib/notifications-runtime', () => ({ useNotificationObserver: jest.fn() }));
jest.mock('@/components/environment-banner', () => ({ EnvironmentBanner: () => null }));
jest.mock('@/components/update-prompt', () => ({ UpdatePrompt: () => null }));
jest.mock('@/components/ui/toast', () => ({ ToastProvider: MockPassthrough }));
jest.mock('@/providers/session', () => ({
  SessionProvider: MockPassthrough,
  useSession: () => mockSessionState,
}));

const mockObserver = useNotificationObserver as jest.MockedFunction<typeof useNotificationObserver>;

beforeEach(() => {
  jest.clearAllMocks();
});

it('does not observe taps while the session is restored but its agreement check is still in flight', async () => {
  // The exact window a cold-start tap lands in.
  mockSessionState = { session: { user: { id: 'me' } }, isLoaded: true, needsAgreement: null };
  await render(<RootLayout />);

  expect(mockObserver).not.toHaveBeenCalled();
});

it('starts observing once the navigator mounts', async () => {
  mockSessionState = { session: { user: { id: 'me' } }, isLoaded: true, needsAgreement: false };
  await render(<RootLayout />);

  expect(mockObserver).toHaveBeenCalled();
});
