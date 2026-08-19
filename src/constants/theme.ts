/**
 * AIR/Rally design tokens, ported 1:1 from the web app's globals.css
 * (warm cream ground, navy ink, one orange — orange is reserved for the
 * thing you should touch next, never decoration). Light and dark define
 * the same keys so `ThemeColor` stays a single union.
 *
 * The three dark soft-status fills are static oklab mixes of the status
 * color into the card navy — the web computes them with
 * `color-mix(in oklab, ...)`, which RN has no equivalent for.
 */

import '@/global.css';

import { Platform } from 'react-native';

const light = {
  background: '#f6f1e8',
  foreground: '#0f2747',

  // Cards are the only true white in the light theme.
  card: '#ffffff',
  cardForeground: '#0f2747',

  // Rally Orange — the energetic, "go" color.
  primary: '#f3700f',
  primaryForeground: '#ffffff',
  primaryPressed: '#d85f06',

  // Deep Navy — trust, structure, nav/header surfaces.
  secondary: '#0f2747',
  secondaryForeground: '#f6f1e8',

  muted: '#f0e9dc',
  // Darkened from #8a8172 so normal-size text clears WCAG AA (4.5:1)
  // against both background (#f6f1e8) and card (#ffffff).
  mutedForeground: '#6f6455',
  subtle: '#6f6757',
  placeholder: '#8a8172',

  accent: '#fdf0e1',
  accentForeground: '#b45309',

  destructive: '#b42318',
  destructiveForeground: '#ffffff',
  success: '#1f9d55',
  successForeground: '#ffffff',
  warning: '#b45309',
  warningForeground: '#ffffff',

  successSoft: '#e6f5ec',
  successSoftForeground: '#166b3c',
  warningSoft: '#fdf0e1',
  warningSoftForeground: '#b45309',
  destructiveSoft: '#fbeae8',
  destructiveSoftForeground: '#b42318',
  neutralSoft: '#eceadf',
  neutralSoftForeground: '#6f6757',

  // Court Clay borders; hairline is for rules drawn inside a card.
  border: '#e6dac6',
  hairline: '#f0e9dc',
  input: '#e6dac6',
  ring: '#f3700f',
  skeleton: '#ece5d7',

  navy: '#0f2747',
  navyForeground: '#f6f1e8',
  navyRaised: '#183658',
  rally: '#f3700f',
  rallyForeground: '#ffffff',
} as const;

export type ThemeColor = keyof typeof light;

/* Navy ground, cream ink. Elevation is a lighter navy, never shadow. */
const dark: Record<ThemeColor, string> = {
  background: '#0b1d36',
  foreground: '#f6f1e8',

  card: '#132a49',
  cardForeground: '#f6f1e8',

  primary: '#f3700f',
  primaryForeground: '#ffffff',
  primaryPressed: '#d85f06',

  // Navy is the ground here, so the "navy surface" role lifts a step.
  secondary: '#1e3b5f',
  secondaryForeground: '#f6f1e8',

  muted: '#132a49',
  mutedForeground: '#9fb0c6',
  subtle: '#c4d0de',
  placeholder: '#7d90a8',

  accent: '#24314a',
  accentForeground: '#f3700f',

  destructive: '#e0574a',
  destructiveForeground: '#0b1d36',
  success: '#37c07a',
  successForeground: '#0b1d36',
  warning: '#f0a63c',
  warningForeground: '#0b1d36',

  successSoft: '#194655',
  successSoftForeground: '#37c07a',
  warningSoft: '#3d4350',
  warningSoftForeground: '#f0a63c',
  destructiveSoft: '#3e374d',
  destructiveSoftForeground: '#f08a80',
  neutralSoft: '#1e3b5f',
  neutralSoftForeground: '#9fb0c6',

  border: '#1e3b5f',
  hairline: '#1e3b5f',
  input: '#1e3b5f',
  ring: '#f3700f',
  skeleton: '#1e3b5f',

  // Was the same value as `card` (#132a49), which made every "selected
  // fill" pattern that compares navy against card (e.g. the booking
  // panel's court/date/time pickers) render as no visible change at all
  // in dark mode — the exact contrast this token pair provides in light
  // mode (navy #0f2747 vs. card #ffffff). Reusing navyRaised's value
  // keeps it a genuinely distinct, already-defined "elevated" surface.
  navy: '#1e3b5f',
  navyForeground: '#f6f1e8',
  navyRaised: '#1e3b5f',
  rally: '#f3700f',
  rallyForeground: '#ffffff',
};

export const Colors: { light: Record<ThemeColor, string>; dark: Record<ThemeColor, string> } = {
  light,
  dark,
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/* The design names four shapes (8 controls, 12 inputs, 16 cards, 24
 * sheets) plus the pill — same explicit steps as the web tokens. */
export const Radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  '3xl': 32,
  pill: 999,
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
