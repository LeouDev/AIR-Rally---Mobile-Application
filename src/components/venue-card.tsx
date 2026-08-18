import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { VenueMarketplaceRow } from '@/lib/database.types';
import { publicImageUrl } from '@/lib/venues';

/** Explore's venue card — cover photo over a white card, name, city,
 * rating, and the one number a player scans for: "from ₱X/hr". */
export function VenueCard({ venue }: { venue: VenueMarketplaceRow }) {
  const theme = useTheme();
  const coverUrl = venue.cover_image_path ? publicImageUrl(venue.cover_image_path) : null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/venue/[id]', params: { id: venue.id } })}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
      ]}>
      <View style={[styles.cover, { backgroundColor: theme.muted }]}>
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={styles.coverImage}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={styles.coverFallback}>
            <ThemedText type="heading" themeColor="mutedForeground">
              {venue.name.slice(0, 1).toUpperCase()}
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <ThemedText type="subtitle" numberOfLines={1} style={styles.name}>
            {venue.name}
          </ThemedText>
          {venue.review_count > 0 ? (
            <ThemedText type="smallBold">
              ★ {venue.average_rating.toFixed(1)}
              <ThemedText type="small" themeColor="mutedForeground">
                {' '}
                ({venue.review_count})
              </ThemedText>
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="mutedForeground">
              New
            </ThemedText>
          )}
        </View>

        <ThemedText type="small" themeColor="subtle" numberOfLines={1}>
          {[venue.city, venue.address].filter(Boolean).join(' · ') || 'Location on request'}
        </ThemedText>

        <View style={styles.metaRow}>
          <ThemedText type="small" themeColor="subtle">
            {venue.active_court_count} {venue.active_court_count === 1 ? 'court' : 'courts'}
            {venue.indoor_outdoor === 'both'
              ? ' · indoor & outdoor'
              : ` · ${venue.indoor_outdoor}`}
          </ThemedText>
          {venue.starting_price !== null ? (
            <ThemedText type="smallBold">
              from ₱{venue.starting_price}
              <ThemedText type="small" themeColor="mutedForeground">
                /hr
              </ThemedText>
            </ThemedText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cover: {
    height: 150,
  },
  coverImage: {
    flex: 1,
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.half,
  },
});
