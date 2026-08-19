import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** "Know someone who owns a court?" — port of the web's ReferralCard.
 * Uses React Native's built-in Share API (no new dependency) instead of
 * a copy button + clipboard package (none is installed in this app).
 * The link is still styled as a deliberate, monospaced "copyable" chip
 * rather than plain wrapped body text, and it's selectable so a
 * long-press still copies it manually on either platform. */
export function ReferralCard({ referralCode }: { referralCode: string }) {
  const theme = useTheme();
  const [shared, setShared] = useState(false);
  const referralUrl = `https://air-rally.com/owner/onboarding?ref=${referralCode}`;

  const handleShare = async () => {
    try {
      const result = await Share.share({
        title: 'Join AIR/Rally',
        message: `Help your favorite court join AIR/Rally.\n${referralUrl}`,
      });
      if (result.action === Share.sharedAction) {
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      // Share sheet dismissed or unavailable — not an error.
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.secondary }]}>
          <ThemedText style={{ fontSize: 20 }}>🤝</ThemedText>
        </View>
        <View style={styles.text}>
          <ThemedText type="smallBold">Know someone who owns a court?</ThemedText>
          <ThemedText type="caption" themeColor="mutedForeground">
            Help your favorite court join AIR/Rally.
          </ThemedText>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={handleShare}
        style={[styles.button, { borderColor: theme.border }]}>
        <ThemedText type="smallBold">{shared ? 'Shared' : 'Refer a Court Owner'}</ThemedText>
      </Pressable>
      <View style={[styles.linkChip, { backgroundColor: theme.muted, borderColor: theme.border }]}>
        <ThemedText type="caption" themeColor="mutedForeground" selectable style={styles.linkText}>
          {referralUrl}
        </ThemedText>
      </View>
    </View>
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
  button: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  linkChip: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  linkText: {
    fontFamily: Fonts.mono,
  },
});
