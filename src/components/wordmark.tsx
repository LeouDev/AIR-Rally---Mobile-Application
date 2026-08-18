import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

/** AIR/Rally wordmark — the "/" is the one place the brand orange sits
 * inside text, same as the web header. */
export function Wordmark({ size = 34 }: { size?: number }) {
  const lineHeight = Math.round(size * 1.15);
  return (
    <View style={styles.row}>
      <ThemedText style={[styles.mark, { fontSize: size, lineHeight }]}>AIR</ThemedText>
      <ThemedText themeColor="rally" style={[styles.mark, { fontSize: size, lineHeight }]}>
        /
      </ThemedText>
      <ThemedText style={[styles.mark, { fontSize: size, lineHeight }]}>Rally</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  mark: {
    fontWeight: 800,
    letterSpacing: -0.5,
  },
});
