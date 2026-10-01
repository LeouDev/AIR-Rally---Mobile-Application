import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, render, waitFor } from '@testing-library/react-native';
import React, { useEffect } from 'react';

import { supabase } from '@/lib/supabase';
import { SessionProvider, useSession } from '@/providers/session';

/**
 * Two startup problems in the session provider:
 *  - Opening the app offline after the access token expired showed the
 *    sign-in screen: supabase-js can't refresh, answers "no session", but
 *    keeps the session and refreshes it once online. The player is still
 *    signed in.
 *  - Every cold start held the splash on a network check of whether the
 *    User Agreement was accepted — which, once true, never changes.
 */

let mockAuthListener: (event: string, session: unknown) => void = () => {};
jest.mock('@/lib/supabase', () => ({
  AUTH_STORAGE_KEY: 'sb-test-auth-token',
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn((listener: (event: string, session: unknown) => void) => {
        mockAuthListener = listener;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
      signOut: jest.fn(),
    },
    from: jest.fn(),
  },
}));
jest.mock('@/lib/push', () => ({
  registerDevicePushToken: jest.fn(async () => null),
  unregisterDevicePushToken: jest.fn(async () => {}),
}));
jest.mock('@/lib/unread', () => ({ refreshUnreadCount: jest.fn(async () => {}) }));
jest.mock('@/lib/booking-reminders', () => ({ cancelBookingReminders: jest.fn(async () => {}) }));

const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

let current: ReturnType<typeof useSession>;
function Probe() {
  const value = useSession();
  // Captured in an effect, not during render (the React Compiler forbids
  // writing outer variables while rendering).
  useEffect(() => {
    current = value;
  });
  return null;
}

const STORED = { access_token: 'expired', refresh_token: 'refresh-1', expires_at: 1, user: { id: 'me' } };

function agreementRows(count: number) {
  const eq = jest.fn().mockResolvedValue({ count, error: null });
  mockFrom.mockReturnValue({ select: () => ({ eq }) });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('opening the app offline with an expired access token', () => {
  it('keeps the player signed in with the session supabase-js still holds', async () => {
    await AsyncStorage.setItem('sb-test-auth-token', JSON.stringify(STORED));
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Network request failed', 0),
    });
    agreementRows(1);

    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(current.isLoaded).toBe(true));
    expect(current.session?.user.id).toBe('me');

    // supabase-js then replays its own offline answer — "no session" — to
    // every listener as INITIAL_SESSION. That must not sign the player out.
    await act(async () => mockAuthListener('INITIAL_SESSION', null));
    expect(current.session?.user.id).toBe('me');
  });

  it('still signs out when the refresh token itself is dead, not just offline', async () => {
    await AsyncStorage.setItem('sb-test-auth-token', JSON.stringify(STORED));
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'),
    });

    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(current.isLoaded).toBe(true));
    expect(current.session).toBeNull();
  });
});

describe('the User Agreement check at startup', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ data: { session: STORED }, error: null });
  });

  it('skips the network check once acceptance is cached on this phone', async () => {
    await AsyncStorage.setItem('agreement-accepted:me', '1');

    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(current.needsAgreement).toBe(false));
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('caches an acceptance the first time it sees one', async () => {
    agreementRows(1);

    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(current.needsAgreement).toBe(false));
    await waitFor(async () => expect(await AsyncStorage.getItem('agreement-accepted:me')).toBe('1'));
  });

  it('still sends a new OAuth arrival to complete sign-up, and caches nothing', async () => {
    agreementRows(0);

    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(current.needsAgreement).toBe(true));
    expect(await AsyncStorage.getItem('agreement-accepted:me')).toBeNull();
  });
});
