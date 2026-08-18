import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Phase 0 placeholder — booking management lands with the booking flow. */
export default function BookingsScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Bookings</ThemedText>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ThemedText type="subtitle">No bookings yet</ThemedText>
          <ThemedText type="small" themeColor="subtle">
            Once booking opens up here, your upcoming and past court time will live on this tab.
          </ThemedText>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
