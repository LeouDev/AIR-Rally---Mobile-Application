import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'air-rally.splash.seen';

/**
 * Whether the app-open animation has already played once on this
 * device. First launch (fresh install, or after a reinstall — the key
 * lives in AsyncStorage, which a reinstall wipes) plays the full-length
 * intro; every launch after that plays at half speed. Backgrounding
 * and foregrounding the app never triggers this at all (the splash
 * only mounts on a cold JS start), so there's nothing to distinguish
 * there.
 */
export async function hasSeenSplashIntro(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === 'true';
  } catch {
    // Storage unavailable — default to "not seen" (the full-length,
    // slower animation). Worst case a returning user sees the long
    // version again; never the reverse of a first-time user getting
    // the too-fast one.
    return false;
  }
}

export async function markSplashIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Best-effort — a failed write just means this launch's "first
    // time" grace extends to the next one too, not a broken splash.
  }
}
