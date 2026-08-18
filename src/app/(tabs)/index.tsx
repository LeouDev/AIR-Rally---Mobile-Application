import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Wordmark } from '@/components/wordmark';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Phase 0 placeholder — venue browsing lands in Phase 1. */
export default function ExploreScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Wordmark size={22} />
          <ThemedText type="title">Explore</ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ThemedText type="subtitle">Court browsing is on its way</ThemedText>
          <ThemedText type="small" themeColor="subtle">
            Soon you&apos;ll browse venues, check live availability, and book a court right from
            here — same marketplace as air-rally.com.
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
  header: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
