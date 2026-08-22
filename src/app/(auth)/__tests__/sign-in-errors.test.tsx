import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import SignInScreen from '@/app/(auth)/sign-in';
import { supabase } from '@/lib/supabase';

/**
 * sign-in.tsx used to translate exactly one string — 'Invalid login
 * credentials' — and pass every other Supabase Auth error straight to
 * the screen verbatim. A rate limit, an unconfirmed email, or a
 * mid-outage 500 all rendered as whatever the SDK's `.message` happened
 * to say. This pins the fix: every error the screen can receive goes
 * through the shared translator, not a one-off string comparison.
 */

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { push: jest.fn() },
}));

jest.mock('@/components/oauth-buttons', () => ({ OAuthButtons: () => null }));

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: jest.fn() } },
}));

const mockSignIn = supabase.auth.signInWithPassword as jest.MockedFunction<typeof supabase.auth.signInWithPassword>;

beforeEach(() => {
  jest.clearAllMocks();
});

async function submit(email: string, password: string) {
  await render(<SignInScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), email);
  await fireEvent.changeText(screen.getByPlaceholderText('Your password'), password);
  await fireEvent.press(screen.getByLabelText('Sign in'));
  await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
}

describe('sign-in error messages', () => {
  it('translates a rate limit instead of showing the SDK message verbatim', async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null, session: null },
      // @ts-expect-error minimal shape for the test
      error: { code: 'over_request_rate_limit', message: 'Email rate limit exceeded' },
    });

    await submit('player@example.com', 'wrongpassword');

    await waitFor(() => {
      expect(screen.queryByText('Email rate limit exceeded')).toBeNull();
      expect(screen.getByText('Too many attempts. Please wait a moment and try again.')).toBeTruthy();
    });
  });

  it('still translates the wrong-password case', async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null, session: null },
      // @ts-expect-error minimal shape for the test
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });

    await submit('player@example.com', 'wrongpassword');

    await waitFor(() => {
      expect(screen.getByText('That email or password is incorrect.')).toBeTruthy();
    });
  });

  it('never shows a raw database or SDK string for an unrecognised error', async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null, session: null },
      // @ts-expect-error minimal shape for the test
      error: { message: 'relation "public.sekrit_table" does not exist' },
    });

    await submit('player@example.com', 'wrongpassword');

    await waitFor(() => {
      expect(screen.queryByText(/sekrit_table/)).toBeNull();
      expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
    });
  });
});
