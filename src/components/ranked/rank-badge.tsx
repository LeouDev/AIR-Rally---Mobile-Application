import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { tierInfo } from '@/lib/ranked';
import type { RankedTier } from '@/lib/database.types';

/**
 * The seven tier badges, rasterized from the web repo's
 * scripts/generate-rank-badges.ts geometry table (same source, so the
 * shapes can't drift — see assets/images/ranks/ for how they were
 * produced). PNG rather than the web's SVG: this app has no SVG-rendering
 * library installed, and adding one (react-native-svg) would be a new
 * native dependency needing a rebuild for a purely cosmetic badge.
 * Metro's bundler needs a static `require()` per asset — it can't resolve
 * a template-string path the way the web's tierBadgeSrc() does — hence
 * the explicit map instead of a computed path.
 */
const BADGES: Record<RankedTier, { light: number; navy: number }> = {
  1: { light: require('@/assets/images/ranks/rank-dinker.png'), navy: require('@/assets/images/ranks/rank-dinker-navy.png') },
  2: { light: require('@/assets/images/ranks/rank-driver.png'), navy: require('@/assets/images/ranks/rank-driver-navy.png') },
  3: { light: require('@/assets/images/ranks/rank-volleyer.png'), navy: require('@/assets/images/ranks/rank-volleyer-navy.png') },
  4: { light: require('@/assets/images/ranks/rank-smasher.png'), navy: require('@/assets/images/ranks/rank-smasher-navy.png') },
  5: { light: require('@/assets/images/ranks/rank-ace.png'), navy: require('@/assets/images/ranks/rank-ace-navy.png') },
  6: {
    light: require('@/assets/images/ranks/rank-kitchen-king.png'),
    navy: require('@/assets/images/ranks/rank-kitchen-king-navy.png'),
  },
  7: { light: require('@/assets/images/ranks/rank-champion.png'), navy: require('@/assets/images/ranks/rank-champion-navy.png') },
};

/** The one badge image, ink-swapped for the surface it sits on. */
export function RankBadge({
  tier,
  on = 'light',
  size = 56,
}: {
  tier: RankedTier;
  /** Which surface this renders on — picks the ink-swapped variant, not just a filter. */
  on?: 'light' | 'navy';
  size?: number;
}) {
  const info = tierInfo(tier);
  return (
    <Image
      source={BADGES[tier][on]}
      accessibilityLabel={`${info.name} badge`}
      style={[styles.image, { width: size, height: size }]}
      contentFit="contain"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    aspectRatio: 1,
  },
});
