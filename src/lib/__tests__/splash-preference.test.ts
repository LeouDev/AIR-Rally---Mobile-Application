import AsyncStorage from '@react-native-async-storage/async-storage';

import { hasSeenSplashIntro, markSplashIntroSeen } from '@/lib/splash-preference';

/**
 * First launch plays the full-length splash animation; every launch
 * after that plays at half speed. The flag is the only thing telling
 * SplashOverlay which one it is, so a read/write bug here silently
 * turns into every launch playing the slow version forever, or the
 * fast version on someone's actual first open.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('reports not-seen before anything has been written', async () => {
  await expect(hasSeenSplashIntro()).resolves.toBe(false);
});

it('reports seen after marking it', async () => {
  await markSplashIntroSeen();
  await expect(hasSeenSplashIntro()).resolves.toBe(true);
});

it('defaults to not-seen (the slower, safer animation) when storage read fails', async () => {
  const spy = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(hasSeenSplashIntro()).resolves.toBe(false);
  spy.mockRestore();
});

it('does not throw when the write fails — a missed write costs a future launch, not this one', async () => {
  const spy = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(markSplashIntroSeen()).resolves.toBeUndefined();
  spy.mockRestore();
});
