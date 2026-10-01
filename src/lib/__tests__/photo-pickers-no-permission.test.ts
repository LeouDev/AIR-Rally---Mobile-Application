import * as ImagePicker from 'expo-image-picker';

import { pickAvatarImage } from '@/lib/avatars';
import { pickPostImages } from '@/lib/post-images';

/**
 * Both pickers used to ask for photo-library permission first and give up
 * if it wasn't granted. The system picker needs no permission, so one
 * "Don't Allow" (or a prompt that read "…to set a profile picture" when
 * attaching a post photo) disabled the avatar and post-photo buttons for
 * good, silently. With permission denied, the picker must still open.
 */

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'denied' })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///photo.jpg', mimeType: 'image/jpeg', fileName: 'photo.jpg' }],
  })),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

beforeEach(() => {
  jest.clearAllMocks();
});

it('opens the avatar picker even with photo access denied, and never asks for it', async () => {
  await expect(pickAvatarImage()).resolves.toEqual({ uri: 'file:///photo.jpg', mimeType: 'image/jpeg' });
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
});

it('opens the post-photo picker even with photo access denied, and never asks for it', async () => {
  await expect(pickPostImages(4)).resolves.toEqual([
    { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', fileName: 'photo.jpg' },
  ]);
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
});
