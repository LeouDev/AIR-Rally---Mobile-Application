import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet } from 'react-native';

import { ReportSheet } from '@/components/report-sheet';
import { useTheme } from '@/hooks/use-theme';
import type { ReportTargetType } from '@/lib/database.types';

/**
 * The moderation trigger for a whole screen — "…" in the navigation bar,
 * opening a menu of actions, plus the report sheet one of them leads to.
 *
 * Started as a bare flag icon that did nothing but open Report. Changed
 * to an overflow the moment a second action (Block) was coming: two
 * standalone icons side by side reads as two unrelated features, where
 * one menu reads as "moderation options for this content" — the same
 * shape Instagram/X use, and the one people already have a mental model
 * for. Report stays the only real destination inside it until blocking's
 * migration exists; the shape is ready for a second item to slot in
 * without another restructure of this component or its call sites.
 *
 * Native OS menus on purpose, not a custom Modal: ActionSheetIOS opens
 * with no mount/animation cost of our own, which is the whole point —
 * someone reaching for Report is often already distressed, and the menu
 * existing at all must not turn what used to be one tap into something
 * that feels slower. Report is listed first for the same reason.
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
  const [reporting, setReporting] = useState(false);

  const openMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Report', 'Cancel'], cancelButtonIndex: 1 },
        (index) => {
          if (index === 0) setReporting(true);
        }
      );
      return;
    }
    Alert.alert('More options', undefined, [
      { text: 'Report', onPress: () => setReporting(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More options for this ${targetLabel}`}
        onPress={openMenu}
        hitSlop={8}
        style={styles.trigger}>
        <Ionicons name="ellipsis-horizontal" size={20} color={theme.foreground} />
      </Pressable>

      <ReportSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        targetType={targetType}
        targetId={targetId}
        targetLabel={targetLabel}
      />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    padding: 4,
  },
});
