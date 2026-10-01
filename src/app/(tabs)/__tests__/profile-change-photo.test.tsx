import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import ProfileScreen from '@/app/(tabs)/profile';
import { updateAvatarUrl, updateProfile } from '@/lib/profile';

/**
 * Changing the photo used to call updateProfile() with the names and
 * phone this screen had loaded — `profile?.first_name ?? ''` and so on.
 * When the profile read had failed (the photo button still renders), the
 * upload wrote empty strings over the player's name and nulled their
 * phone; when it succeeded, it overwrote any edit made on the web since.
 * The photo flow must write the photo and nothing else.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(callback, [callback]);
  },
}));
// Stable across renders — `show` is in load()'s deps, so a fresh fn per
// render would re-run the focus effect forever.
const mockShow = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: mockShow }) }));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me', email: 'me@example.com' } }, signOut: jest.fn() }),
}));
// Every read fails — the state in which the old code blanked the name.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'Network request failed' } }) }),
      }),
    }),
  },
}));
jest.mock('@/lib/profile-stats', () => ({ getProfileStats: jest.fn(async () => ({ tripCount: 0, reviewCount: 0 })) }));
jest.mock('@/lib/follows', () => ({
  ...jest.requireActual('@/lib/follows'),
  getFollowCounts: jest.fn(async () => ({ followers: 0, following: 0 })),
}));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getPlayerMatchTotals: jest.fn(async () => null),
  getPlayerRank: jest.fn(async () => null),
}));
jest.mock('@/lib/avatars', () => ({
  pickAvatarImage: jest.fn(async () => ({ uri: 'file:///photo.jpg', mimeType: 'image/jpeg' })),
  uploadAvatar: jest.fn(async () => 'https://cdn.example/avatars/me.jpg'),
}));
const mockSavedProfile = {
  id: 'me',
  display_name: 'Leou',
  avatar_url: 'https://cdn.example/avatars/me.jpg',
  role: 'player',
  created_at: '2026-08-01T00:00:00.000Z',
};
jest.mock('@/lib/profile', () => ({
  ...jest.requireActual('@/lib/profile'),
  updateProfile: jest.fn(async () => mockSavedProfile),
  updateAvatarUrl: jest.fn(async () => mockSavedProfile),
}));

it('writes only the new photo, even when the profile itself failed to load', async () => {
  await render(<ProfileScreen />);

  await fireEvent.press(await screen.findByLabelText('Change profile photo'));
  await waitFor(() =>
    expect(jest.mocked(updateAvatarUrl).mock.calls.length + jest.mocked(updateProfile).mock.calls.length).toBe(1)
  );

  // The old path: updateProfile with firstName/lastName/displayName '' and phone ''.
  expect(updateProfile).not.toHaveBeenCalled();
  expect(updateAvatarUrl).toHaveBeenCalledWith('me', 'https://cdn.example/avatars/me.jpg');
});
