import { render } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import RootLayout from '@/app/_layout';
import { rememberIncomingLink, takePendingLink } from '@/lib/pending-link';

/**
 * The replay half: once the signed-out player finishes signing in, the
 * root layout takes them to the link they tapped, not to Explore.
 */

let mockSessionState: { session: unknown; isLoaded: boolean; needsAgreement: boolean | null } = {
  session: null,
  isLoaded: true,
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
  return {
    Stack,
    router: { push: jest.fn() },
    ThemeProvider: MockPassthrough,
    DarkTheme: { colors: {} },
    DefaultTheme: { colors: {} },
  };
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

beforeEach(() => {
  jest.clearAllMocks();
  takePendingLink(0);
});

it('takes a player who just signed in to the link they tapped while signed out', async () => {
  mockSessionState = { session: null, isLoaded: true, needsAgreement: null };
  const view = await render(<RootLayout />);
  rememberIncomingLink('/events/e1'); // the link that met the sign-in screen

  mockSessionState = { session: { user: { id: 'me' } }, isLoaded: true, needsAgreement: false };
  await view.rerender(<RootLayout />);

  expect(router.push).toHaveBeenCalledWith('/events/e1');
});

it('does nothing on sign-in when no link is waiting', async () => {
  mockSessionState = { session: null, isLoaded: true, needsAgreement: null };
  const view = await render(<RootLayout />);

  mockSessionState = { session: { user: { id: 'me' } }, isLoaded: true, needsAgreement: false };
  await view.rerender(<RootLayout />);

  expect(router.push).not.toHaveBeenCalled();
});
