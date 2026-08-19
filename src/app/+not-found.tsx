import { Link, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/**
 * Replaces expo-router's stock black "Unmatched Route" screen (generic
 * copy, a debug "Sitemap" link) with one that matches the rest of the
 * app — the only way in here is a stale or bad deep link.
 */
export default function NotFoundScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Wordmark size={26} />
          <ThemedText type="heading">Page not found</ThemedText>
          <ThemedText themeColor="subtle">
            That link doesn't lead anywhere anymore. Head back to the app.
          </ThemedText>
          <Button title="Go to Explore" onPress={() => router.replace('/')} />
          <Link href="/" style={styles.link}>
            <ThemedText type="small" themeColor="primary">
              Go home
            </ThemedText>
          </Link>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  link: {
    marginTop: Spacing.one,
  },
});
