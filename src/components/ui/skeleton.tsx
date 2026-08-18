import { useEffect, useRef } from 'react';
import { Animated, type DimensionValue } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Skeletons pulse, never spin — a pulse claims the layout is already
 * right and only the content is missing (same rationale as the web's
 * skeleton-pulse keyframes). */
export function Skeleton({
  width = '100%',
  height,
  radius = Radius.lg,
}: {
  width?: DimensionValue;
  height: number;
  radius?: number;
}) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.95, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{ width, height, borderRadius: radius, backgroundColor: theme.skeleton, opacity }}
    />
  );
}
