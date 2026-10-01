import { Colors } from '@/constants/theme';

/**
 * Rally Orange #f3700f carried white text on every primary button (2.94:1)
 * and orange links sat on the cream ground at 2.62:1 — below WCAG AA even
 * for large text, read outdoors at a court. These compute the real ratios,
 * so a token edit that brings that back fails here rather than on a sunny
 * court.
 */

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = Colors.light;
const AA = 4.5;

it.each([
  ['primary button labels', light.primaryForeground, light.primary],
  ['rally-filled labels', light.rallyForeground, light.rally],
  ['orange text on the cream ground', light.primaryText, light.background],
  ['orange text on white cards', light.primaryText, light.card],
  ['orange text on muted fills', light.primaryText, light.muted],
  ['orange text on the accent tint', light.primaryText, light.accent],
])('%s clear WCAG AA', (_label, foreground, background) => {
  expect(contrast(foreground, background)).toBeGreaterThanOrEqual(AA);
});

it('keeps the bright orange where it already passes: on navy', () => {
  expect(contrast(light.rally, light.navy)).toBeGreaterThanOrEqual(AA);
});
