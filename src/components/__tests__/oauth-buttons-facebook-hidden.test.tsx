import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { OAuthButtons } from '@/components/oauth-buttons';
import { FACEBOOK_SIGN_IN_ENABLED } from '@/lib/oauth';

/**
 * Facebook Login is unusable for real users while the Meta app sits in
 * Development mode — it only succeeds for accounts on the Meta app's own
 * admin/developer/tester roster. It passed manual testing precisely
 * because the person testing was an admin, so the button looked fine to
 * the only person who could ever make it work.
 *
 * These pin the user-facing property (the button is not offered) rather
 * than the flag's value, so they keep meaning something if the flag is
 * renamed or moved — and they flip automatically the day it goes true,
 * which is what should happen: the button coming back is the point.
 */

jest.mock('@/lib/oauth', () => ({
  ...jest.requireActual('@/lib/oauth'),
  signInWithProvider: jest.fn(),
  signInWithApple: jest.fn(),
}));
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  AppleAuthenticationButton: () => null,
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 1 },
}));

it('does not offer Facebook sign-in while it is disabled', async () => {
  await render(<OAuthButtons />);

  if (FACEBOOK_SIGN_IN_ENABLED) {
    // The flag has been turned back on — Meta presumably cleared
    // verification. Then the button SHOULD be there.
    expect(screen.getByLabelText('Continue with Facebook')).toBeTruthy();
    return;
  }
  expect(screen.queryByLabelText('Continue with Facebook')).toBeNull();
});

it('still offers a working way to sign in', async () => {
  // Hiding a broken provider must not leave someone with no route in.
  await render(<OAuthButtons />);

  expect(screen.getByLabelText('Continue with Google')).toBeTruthy();
});
