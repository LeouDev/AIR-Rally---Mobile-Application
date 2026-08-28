import type { ColorSchemeName } from 'react-native';

/**
 * Web counterpart to use-color-scheme.ts — forced light for the same
 * founder preference. The hydration dance the previous implementation did
 * (render 'light' on the server, swap to the real scheme once mounted)
 * is moot when the answer is always 'light', and removing it also removes
 * the flash of the wrong theme it existed to manage.
 *
 * Keep this in step with the native file: two variants disagreeing about
 * the app's own theme is exactly the divergence having a shared hook is
 * meant to prevent.
 */
export function useColorScheme(): ColorSchemeName {
  return 'light';
}
