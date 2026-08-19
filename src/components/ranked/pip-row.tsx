import { StyleSheet, View } from 'react-native';

import { pipRow } from '@/lib/ranked';
import { useTheme } from '@/hooks/use-theme';
import type { RankedPips } from '@/lib/database.types';

const SIZES = { sm: 8, md: 11, lg: 16 } as const;

/**
 * The ladder's whole visual grammar: five diamonds (rotated squares),
 * filled left to right. Matches the web's pip treatment — rotated
 * squares, not a dot or a star.
 */
export function PipRow({
  pips,
  on = 'light',
  size = 'md',
}: {
  pips: RankedPips;
  on?: 'light' | 'navy';
  size?: keyof typeof SIZES;
}) {
  const theme = useTheme();
  const px = SIZES[size];
  const borderWidth = size === 'lg' ? 2 : 1;
  const filledColor = on === 'navy' ? theme.navyForeground : theme.primary;
  const emptyBorderColor = on === 'navy' ? theme.navyForeground : theme.foreground;

  return (
    <View style={styles.row} accessibilityRole="image" accessibilityLabel={`${pips} of 5 pips`}>
      {pipRow(pips).map((state, i) => (
        <View
          key={i}
          style={[
            styles.pip,
            {
              width: px,
              height: px,
              borderWidth,
              borderColor: state === 'filled' ? filledColor : emptyBorderColor,
              backgroundColor: state === 'filled' ? filledColor : 'transparent',
              opacity: state === 'filled' ? 1 : 0.5,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pip: {
    transform: [{ rotate: '45deg' }],
  },
});
