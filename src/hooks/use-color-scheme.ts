import type { ColorSchemeName } from 'react-native';

/**
 * THE APP IS FORCED TO LIGHT. This deliberately does not read the device.
 *
 * Founder preference, not a bug — dark mode renders correctly, they simply
 * want the app to look the same on every phone. This is the single source
 * of truth for that: every screen reads the scheme through here, including
 * the three that previously imported `useColorScheme` straight from
 * `react-native` and so were unreachable from any central switch.
 *
 * TO RESTORE SYSTEM-FOLLOWING: return `useRNColorScheme()` again here (and
 * in the .web variant), and nothing else needs touching.
 *
 * WHAT THIS CANNOT DO: it only governs surfaces this app paints. Native UI
 * still follows the phone — the keyboard, the share sheet, system alerts,
 * and the SwiftUI DatePicker in components/ui/date-time-field.tsx. On a
 * dark-mode phone the app is light while those stay dark. Closing that gap
 * needs `userInterfaceStyle: "light"` in app.json, which is a fingerprint
 * input and therefore a new binary, not an OTA.
 */
export function useColorScheme(): ColorSchemeName {
  return 'light';
}
