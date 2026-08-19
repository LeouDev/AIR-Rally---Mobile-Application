import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { VenueMarketplaceRow } from '@/lib/database.types';
import type { OpenStatus } from '@/lib/open-status';
import { publicImageUrl } from '@/lib/venues';

type VenueCardProps = {
  venue: VenueMarketplaceRow & { openStatus?: OpenStatus };
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
};

/**
 * Explore's venue card, image-led: the photo IS the card — a tall
 * rounded cover with the text sitting directly on the page ground below
 * it (no box, no border), the way listing-first apps read. One bold
 * title row with the rating tucked right, two muted metadata lines, and
 * the price as the closing line.
 */
export function VenueCard({ venue, isFavorited, onToggleFavorite }: VenueCardProps) {
  const theme = useTheme();
  const coverUrl = venue.cover_image_path ? publicImageUrl(venue.cover_image_path) : null;

  return (
    <View style={styles.cardWrap}>
      {/* A favorite-heart Pressable rendered as a sibling, not a child, of
          the card's own Pressable — on web, Pressable with
          accessibilityRole="button" becomes a real <button>, and nesting
          one <button> inside another is invalid HTML that React (and some
          browsers) silently un-nest, breaking hit-testing. Both share the
          same absolute-positioning frame of reference via this wrapper. */}
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
          {venue.openStatus ? (
            <View style={[styles.statusPill, { backgroundColor: theme.background }]}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: venue.openStatus.isOpenNow ? theme.success : theme.mutedForeground },
                ]}
              />
              <ThemedText type="caption" themeColor={venue.openStatus.isOpenNow ? 'foreground' : 'mutedForeground'}>
                {venue.openStatus.label}
              </ThemedText>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <ThemedText type="subtitle" numberOfLines={1} style={styles.name}>
              {venue.name}
            </ThemedText>
            {venue.review_count > 0 ? (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color={theme.foreground} />
                <ThemedText type="smallBold">{venue.average_rating.toFixed(1)}</ThemedText>
              </View>
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

      {onToggleFavorite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFavorited ? 'Remove from saved courts' : 'Save this court'}
          onPress={onToggleFavorite}
          hitSlop={8}
          style={[styles.favoriteButton, { backgroundColor: theme.background }]}>
          <Ionicons
            name={isFavorited ? 'heart' : 'heart-outline'}
            size={20}
            color={isFavorited ? theme.primary : theme.mutedForeground}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  card: {
    gap: Spacing.two,
  },
  cardWrap: {
    position: 'relative',
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
  statusPill: {
    position: 'absolute',
    left: Spacing.two,
    bottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  favoriteButton: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
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
