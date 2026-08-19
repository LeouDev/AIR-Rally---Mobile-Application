import { StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'destructive' | 'accent';

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  style?: ViewStyle;
};

/**
 * One shared "small rounded status label" — previously hand-rolled at 12+
 * call sites (booking status, club role, venue open/closed, owner
 * dashboard...) with drifting padding and, in owner/index.tsx, two
 * different corner shapes in the same row. Every tone maps to the
 * existing soft-status tokens so it's automatically correct in both
 * themes.
 */
export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const theme = useTheme();

  const { bg, fg } =
    tone === 'success'
      ? { bg: theme.successSoft, fg: theme.successSoftForeground }
      : tone === 'warning'
        ? { bg: theme.warningSoft, fg: theme.warningSoftForeground }
        : tone === 'destructive'
          ? { bg: theme.destructiveSoft, fg: theme.destructiveSoftForeground }
          : tone === 'accent'
            ? { bg: theme.accent, fg: theme.accentForeground }
            : { bg: theme.neutralSoft, fg: theme.neutralSoftForeground };

  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <ThemedText type="caption" style={{ color: fg, lineHeight: 16 }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    alignSelf: 'flex-start',
  },
});
