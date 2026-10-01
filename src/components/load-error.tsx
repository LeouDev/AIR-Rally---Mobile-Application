import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * What a screen shows when its first load FAILED — as opposed to loading
 * and finding nothing. Screens used to fold both into the same "not
 * found" / "empty" copy, so a dropped request on mobile data read as a
 * deleted match, a delisted venue or an account with no venues, with no
 * way back but leaving the screen. Same card as the club and player
 * screens' inline versions.
 */
export function LoadError({ title, onRetry }: { title: string; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <ThemedText type="subtitle">{title}</ThemedText>
      <ThemedText type="small" themeColor="subtle">
        Check your connection and try again.
      </ThemedText>
      <Button title="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
