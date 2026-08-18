import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { VenueMarketplaceRow } from '@/lib/database.types';
import { publicImageUrl } from '@/lib/venues';

/**
 * Explore's venue card, image-led: the photo IS the card — a tall
 * rounded cover with the text sitting directly on the page ground below
 * it (no box, no border), the way listing-first apps read. One bold
 * title row with the rating tucked right, two muted metadata lines, and
 * the price as the closing line.
 */
export function VenueCard({ venue }: { venue: VenueMarketplaceRow }) {
  const theme = useTheme();
  const coverUrl = venue.cover_image_path ? publicImageUrl(venue.cover_image_path) : null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/venue/[id]', params: { id: venue.id } })}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.92 : 1 }]}>
      <View style={[styles.cover, { backgroundColor: theme.muted }]}>
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={styles.coverImage}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={styles.coverFallback}>
            <ThemedText type="title" themeColor="mutedForeground">
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
            <ThemedText type="smallBold">★ {venue.average_rating.toFixed(1)}</ThemedText>
          ) : (
            <ThemedText type="small" themeColor="mutedForeground">
              New
            </ThemedText>
          )}
        </View>

        <ThemedText type="small" themeColor="subtle" numberOfLines={1}>
          {[venue.city, venue.address].filter(Boolean).join(' · ') || 'Location on request'}
        </ThemedText>
        <ThemedText type="small" themeColor="subtle">
          {venue.active_court_count} {venue.active_court_count === 1 ? 'court' : 'courts'}
          {venue.indoor_outdoor === 'both' ? ' · indoor & outdoor' : ` · ${venue.indoor_outdoor}`}
        </ThemedText>

        {venue.starting_price !== null ? (
          <ThemedText type="smallBold" style={styles.price}>
            ₱{venue.starting_price.toLocaleString('en-PH')}
            <ThemedText type="small" themeColor="subtle">
              {' '}
              / hour
            </ThemedText>
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  cover: {
    height: 240,
    borderRadius: Radius.xl,
    overflow: 'hidden',
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
    gap: 3,
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
  price: {
    marginTop: Spacing.half,
  },
});
