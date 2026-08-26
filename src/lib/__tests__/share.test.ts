import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import { shareCard } from '@/lib/share';

/**
 * Every share this app sent before shareCard() existed arrived as a
 * picture with no way to tap through to anything — expo-sharing's
 * options are {mimeType, UTI, dialogTitle, anchor} with no text or url
 * field at all. These pin the platform split that fixes it, because the
 * split is the whole point and it's invisible from either platform
 * alone:
 *   iOS  — RN's own Share carries image AND text+link in one payload.
 *   Android — RN drops `url` and ShareModule is text/plain-only, so the
 *             image has to go via expo-sharing and the link is lost
 *             until react-native-share lands.
 * A regression here doesn't crash; it silently drops the link again.
 */

jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const mockIsAvailable = Sharing.isAvailableAsync as jest.MockedFunction<typeof Sharing.isAvailableAsync>;
const mockShareAsync = Sharing.shareAsync as jest.MockedFunction<typeof Sharing.shareAsync>;

let shareSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  mockIsAvailable.mockResolvedValue(true);
  mockShareAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  shareSpy.mockRestore();
  Platform.OS = 'ios';
});

describe('shareCard on iOS', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
  });

  it('sends the image and the link together in one payload', async () => {
    await shareCard({ fileUri: 'file:///tmp/card.png', message: 'Rally Point', url: 'https://air-rally.com/courts/v1' });

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0] as { message: string; url: string };
    expect(arg.url).toBe('file:///tmp/card.png');
    expect(arg.message).toContain('Rally Point');
    expect(arg.message).toContain('https://air-rally.com/courts/v1');
  });

  it('does not reach for expo-sharing at all — that path cannot carry a link', async () => {
    await shareCard({ fileUri: 'file:///tmp/card.png', message: 'Rally Point', url: 'https://air-rally.com/courts/v1' });

    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('omits the URL entirely when the object has no public page', async () => {
    await shareCard({ fileUri: 'file:///tmp/card.png', message: 'I won 11-9.' });

    const arg = shareSpy.mock.calls[0][0] as { message: string };
    expect(arg.message).toBe('I won 11-9.');
    expect(arg.message).not.toContain('http');
  });

  it('still sends text and link when there was no image to capture', async () => {
    await shareCard({ message: 'Rally Point', url: 'https://air-rally.com/courts/v1' });

    const arg = shareSpy.mock.calls[0][0] as { message: string; url?: string };
    expect(arg.url).toBeUndefined();
    expect(arg.message).toContain('https://air-rally.com/courts/v1');
  });
});

describe('shareCard on Android', () => {
  beforeEach(() => {
    Platform.OS = 'android';
  });

  it('sends the image via expo-sharing — RN Share cannot carry a file there', async () => {
    await shareCard({ fileUri: 'file:///tmp/card.png', message: 'Rally Point', url: 'https://air-rally.com/courts/v1' });

    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///tmp/card.png',
      expect.objectContaining({ mimeType: 'image/png' })
    );
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('falls back to text-with-link when the OS share sheet is unavailable', async () => {
    mockIsAvailable.mockResolvedValue(false);

    await shareCard({ fileUri: 'file:///tmp/card.png', message: 'Rally Point', url: 'https://air-rally.com/courts/v1' });

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0] as { message: string };
    expect(arg.message).toContain('https://air-rally.com/courts/v1');
  });

  it('never throws when the user dismisses the sheet', async () => {
    mockShareAsync.mockRejectedValue(new Error('dismissed'));
    shareSpy.mockRejectedValue(new Error('dismissed'));

    await expect(
      shareCard({ fileUri: 'file:///tmp/card.png', message: 'Rally Point' })
    ).resolves.toBeUndefined();
  });
});
