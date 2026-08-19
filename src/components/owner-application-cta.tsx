import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { OwnerStatus } from '@/lib/database.types';

const ONBOARDING_URL = 'https://air-rally.com/owner/onboarding';

/**
 * "Become a Venue Owner" — port of the web's OwnerApplicationCTA, minus
 * actually starting the application: that flow now requires acknowledging
 * the Venue Owner Agreement first (a recent web-only addition), so rather
 * than half-replicate it, this just opens the same wizard the web app
 * already has, matching the existing "management stays on web" pattern
 * this app's own owner dashboard already follows.
 */
export function OwnerApplicationCTA({ ownerStatus }: { ownerStatus: OwnerStatus }) {
  const theme = useTheme();

  if (ownerStatus === 'pending') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => Linking.openURL(ONBOARDING_URL)}
        style={[styles.card, styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.icon, { backgroundColor: theme.warningSoft }]}>
          <ThemedText style={{ fontSize: 20 }}>🏟</ThemedText>
        </View>
        <View style={styles.text}>
          <ThemedText type="smallBold">Your owner application is under review</ThemedText>
          <ThemedText type="caption" themeColor="mutedForeground">
            Our team reviews your facility before it goes live. Check status →
          </ThemedText>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => Linking.openURL(ONBOARDING_URL)}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.accent }]}>
          <ThemedText style={{ fontSize: 20 }}>🏟</ThemedText>
        </View>
        <View style={styles.text}>
          <ThemedText type="smallBold">Become a Venue Owner</ThemedText>
          <ThemedText type="caption" themeColor="mutedForeground">
            Have a court? Turn unused hours into income with AIR/Rally.
          </ThemedText>
        </View>
      </View>
      <ThemedText type="smallBold" themeColor="primary" style={styles.cta}>
        Start Owner Application →
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  cta: {
    alignSelf: 'flex-end',
  },
});
