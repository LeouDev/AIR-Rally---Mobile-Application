import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ReportSheet } from '@/components/report-sheet';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ReportTargetType } from '@/lib/database.types';

/**
 * The report affordance for a whole screen — a flag in the navigation
 * bar, plus the sheet it opens.
 *
 * One component rather than each screen hand-rolling a button and its
 * own sheet state, so every surface App Store Guideline 1.2 covers
 * (post, comment, club, event, player) reports the same way and a reader
 * who finds it once knows where to look everywhere else.
 *
 * Rendered as a row with a single child on purpose: blocking is being
 * designed and will sit beside this on these same screens. A row that
 * already exists costs nothing now and means that change is an addition
 * rather than a restructure.
 */
export function ReportAction({
  targetType,
  targetId,
  targetLabel,
}: {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
}) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Report ${targetLabel}`}
        onPress={() => setVisible(true)}
        hitSlop={8}>
        <Ionicons name="flag-outline" size={20} color={theme.foreground} />
      </Pressable>

      <ReportSheet
        visible={visible}
        onClose={() => setVisible(false)}
        targetType={targetType}
        targetId={targetId}
        targetLabel={targetLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
