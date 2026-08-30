import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Linking,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { captureRef } from 'react-native-view-shot';

import { BookingPanel } from '@/components/booking-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VenueReviews } from '@/components/venue-reviews';
import { VenueShareCard, venueShareMessage, venueShareUrl } from '@/components/venue-share-card';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addFavorite, listFavoriteVenueIds, removeFavorite } from '@/lib/favorites';
import { condensedSchedule, directionsUrl, getVenueDetail, publicImageUrl, type VenueDetail } from '@/lib/venues';
import { instagramStoriesAvailable, shareCard, shareToInstagramStory } from '@/lib/share';
import { useSession } from '@/providers/session';

export default function VenueDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [venue, setVenue] = useState<VenueDetail | null | undefined>(undefined);
  const [isFavorite, setIsFavorite] = useState<boolean | undefined>(undefined);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [galleryWidth, setGalleryWidth] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const shareCardRef = useRef<View>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getVenueDetail(id)
      .then((detail) => {
        if (!cancelled) setVenue(detail);
      })
      .catch(() => {
        if (!cancelled) setVenue(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || !userId) {
      setIsFavorite(undefined);
      return;
    }
    let cancelled = false;
    listFavoriteVenueIds(userId)
      .then((ids) => {
        if (!cancelled) setIsFavorite(ids.includes(id));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, userId]);

  const toggleFavorite = async () => {
    if (!id || !userId || favoriteBusy) return;
    const next = !isFavorite;
    setIsFavorite(next);
    setFavoriteBusy(true);
    try {
      if (next) {
        await addFavorite(userId, id);
      } else {
        await removeFavorite(userId, id);
      }
    } catch {
      setIsFavorite(!next);
    } finally {
      setFavoriteBusy(false);
    }
  };

  /** Unlike the match-result and COURT/Side shares, this one carries a
   * real URL: /courts/{id} is genuinely public and already unfurls with
   * the venue's own photo. See venue-share-card.tsx. */
  const shareVenue = async () => {
    if (!venue) return;
    const message = venueShareMessage(venue);
    const url = venueShareUrl(venue.id);
    try {
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 1, width: 1080, height: 1920 });
      await shareCard({ fileUri: uri, message, url });
    } catch {
      // Capture failed — send the text and link alone rather than
      // nothing. Still the useful half of the share.
      await shareCard({ message, url });
    }
  };

  // A separate code path rather than folding Instagram into shareVenue()
  // above: Stories needs the raw image handed directly to Instagram's own
  // composer, not routed through the OS share sheet where Instagram may
  // or may not appear reliably as a destination — see handleSharePress
  // below for where the two are offered as a choice behind one icon.
  // iOS only — the config plugin only declared the instagram-stories
  // query scheme for iOS, matching Phase 1's "iOS ships first" precedent
  // for this feature. Silently absent rather than a dead option when no
  // Meta App ID is configured — see instagramStoriesAvailable() in
  // lib/share.ts.
  const shareVenueToInstagramStory = async () => {
    if (!venue) return;
    const url = venueShareUrl(venue.id);
    try {
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 1, width: 1080, height: 1920 });
      await shareToInstagramStory({ fileUri: uri, url });
    } catch {
      // Capture failed — nothing sensible to hand Instagram without an
      // image; unlike shareCard() there's no meaningful text-only Story.
    }
  };

  // One header icon, not two — the founder's call on the two-icon
  // header. Instagram Story survives behind it rather than being
  // deleted: it's a real, deliberately-declared capability (the
  // instagram-stories query scheme in app.json), and shareVenueToInstagramStory's
  // own reasoning above for why it can't just be folded into the OS
  // share sheet still holds. When Instagram Story is actually offerable,
  // Share presents the choice; otherwise it goes straight to the OS
  // share sheet exactly as before.
  const handleSharePress = () => {
    if (Platform.OS === 'ios' && instagramStoriesAvailable()) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Share…', 'Instagram Story'], cancelButtonIndex: 0 },
        (index) => {
          if (index === 1) shareVenue();
          else if (index === 2) shareVenueToInstagramStory();
        }
      );
      return;
    }
    shareVenue();
  };

  // Web renders every photo in a gallery — mirror that here instead of
  // only ever showing imagePaths[0] as a single static cover.
  const galleryImages = venue
    ? venue.imagePaths.length > 0
      ? venue.imagePaths
      : venue.cover_image_path
        ? [venue.cover_image_path]
        : []
    : [];
  const directions = venue ? directionsUrl(venue) : null;
  const hasContact = Boolean(venue?.phone || venue?.email);

  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (galleryWidth <= 0) return;
    const index = Math.round(e.nativeEvent.contentOffset.x / galleryWidth);
    setGalleryIndex(index);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          title: venue?.name ?? '',
          headerTintColor: theme.primary,
          headerTitleStyle: { color: theme.foreground },
          headerStyle: { backgroundColor: theme.background },
          headerRight: venue
            ? () => (
                <View style={styles.headerActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Share this court"
                    onPress={handleSharePress}
                    hitSlop={8}>
                    {/* Matches the back chevron's actual rendered color,
                        not headerTintColor's nominal theme.primary — on
                        this react-native-screens version the native
                        chevron doesn't honor headerTintColor (32
                        confirmed live, navy chevron next to an orange
                        icon set from the same value). Forcing the
                        chevron orange would mean fighting a native
                        rendering path we can't see; matching the one
                        icon we DO control to what's actually on screen
                        is the one-line fix. Scoped to this screen only —
                        booking/[id].tsx, booking/[id]/reschedule.tsx,
                        and owner/index.tsx have the same headerTintColor
                        pattern but weren't asked about. */}
                    <Ionicons name="share-outline" size={22} color={theme.navy} />
                  </Pressable>
                </View>
              )
            : undefined,
        }}
      />
      {venue ? (
        <View style={styles.shareCardOffscreen} pointerEvents="none">
          <VenueShareCard venue={venue} viewRef={shareCardRef} />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.scroll}>
        {venue === undefined ? (
          <View style={styles.section}>
            <Skeleton height={200} radius={Radius.xl} />
            <Skeleton height={28} width="60%" radius={Radius.sm} />
            <Skeleton height={72} radius={Radius.xl} />
          </View>
        ) : venue === null ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText type="subtitle">This venue isn&apos;t available</ThemedText>
            <ThemedText type="small" themeColor="subtle">
              It may have been archived, or the link is out of date.
            </ThemedText>
          </View>
        ) : (
          <>
            <View
              style={[styles.cover, { backgroundColor: theme.muted }]}
              onLayout={(e) => setGalleryWidth(e.nativeEvent.layout.width)}>
              {galleryImages.length > 0 ? (
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={onGalleryScroll}
                  style={styles.galleryScroll}>
                  {galleryImages.map((path, index) => (
                    <Image
                      key={`${path}-${index}`}
                      source={{ uri: publicImageUrl(path) }}
                      style={[styles.coverImage, galleryWidth > 0 && { width: galleryWidth }]}
                      contentFit="cover"
                      transition={150}
                    />
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.coverFallback}>
                  <ThemedText type="title" themeColor="mutedForeground">
                    {venue.name.slice(0, 1).toUpperCase()}
                  </ThemedText>
                </View>
              )}
              {galleryImages.length > 1 ? (
                <View style={styles.galleryDots} pointerEvents="none">
                  {galleryImages.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.galleryDot,
                        {
                          backgroundColor:
                            index === galleryIndex ? theme.rallyForeground : 'rgba(246,241,232,0.5)',
                        },
                      ]}
                    />
                  ))}
                </View>
              ) : null}
              {userId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isFavorite ? 'Remove from saved courts' : 'Save this court'}
                  onPress={toggleFavorite}
                  hitSlop={8}
                  style={[styles.favoriteButton, { backgroundColor: theme.background }]}>
                  <Ionicons
                    name={isFavorite ? 'heart' : 'heart-outline'}
                    size={20}
                    color={isFavorite ? theme.primary : theme.mutedForeground}
                  />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.section}>
              <View style={styles.titleBlock}>
                <ThemedText type="heading">{venue.name}</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  {[venue.address, venue.city].filter(Boolean).join(', ') ||
                    'Location shared after booking'}
                </ThemedText>
                <View style={styles.badgeRow}>
                  {venue.review_count > 0 ? (
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={14} color={theme.foreground} />
                      <ThemedText type="smallBold">
                        {venue.average_rating.toFixed(1)}{' '}
                        <ThemedText type="small" themeColor="mutedForeground">
                          ({venue.review_count} {venue.review_count === 1 ? 'review' : 'reviews'})
                        </ThemedText>
                      </ThemedText>
                    </View>
                  ) : (
                    <View style={[styles.pill, { backgroundColor: theme.neutralSoft }]}>
                      <ThemedText type="caption" style={{ color: theme.neutralSoftForeground }}>
                        New venue
                      </ThemedText>
                    </View>
                  )}
                  <View style={[styles.pill, { backgroundColor: theme.accent }]}>
                    <ThemedText type="caption" style={{ color: theme.accentForeground }}>
                      {venue.indoor_outdoor === 'both'
                        ? 'Indoor & outdoor'
                        : venue.indoor_outdoor === 'indoor'
                          ? 'Indoor'
                          : 'Outdoor'}
                    </ThemedText>
                  </View>
                </View>
                {directions ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => Linking.openURL(directions)}
                    style={styles.directionsLink}>
                    <ThemedText type="smallBold" themeColor="primary">
                      Get directions →
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>

              {venue.description ? (
                <ThemedText type="small" themeColor="subtle" numberOfLines={2}>
                  {venue.description}
                </ThemedText>
              ) : null}

              {venue.courts.length === 0 ? (
                <ThemedText type="small" themeColor="subtle">
                  No active courts listed right now.
                </ThemedText>
              ) : (
                <BookingPanel venue={venue} />
              )}

              {venue.amenities.length > 0 ? (
                <View style={styles.block}>
                  <ThemedText type="caption" themeColor="mutedForeground" style={styles.metaLabel}>
                    AMENITIES
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipStrip}>
                    {venue.amenities.map(({ amenity, available }) => (
                      <View
                        key={amenity.id}
                        style={[
                          styles.pill,
                          {
                            backgroundColor: available ? theme.neutralSoft : 'transparent',
                            borderWidth: available ? 0 : 1,
                            borderColor: theme.border,
                          },
                        ]}>
                        <ThemedText
                          type="caption"
                          style={{
                            color: available ? theme.neutralSoftForeground : theme.mutedForeground,
                            textDecorationLine: available ? 'none' : 'line-through',
                          }}>
                          {amenity.name}
                        </ThemedText>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {venue.hours.length > 0 ? (
                <View style={styles.block}>
                  <ThemedText type="caption" themeColor="mutedForeground" style={styles.metaLabel}>
                    OPENING HOURS
                  </ThemedText>
                  {condensedSchedule(venue.hours).map((row) => (
                    <View key={row.label} style={styles.hoursRow}>
                      <ThemedText type="smallBold">{row.label}</ThemedText>
                      <ThemedText type="small" themeColor="subtle">
                        {row.hours}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              ) : null}

              {hasContact ? (
                <View style={styles.block}>
                  <ThemedText type="caption" themeColor="mutedForeground" style={styles.metaLabel}>
                    CONTACT
                  </ThemedText>
                  {venue.phone ? (
                    <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${venue.phone}`)}>
                      <ThemedText type="small" themeColor="primary">
                        {venue.phone}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                  {venue.email ? (
                    <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`mailto:${venue.email}`)}>
                      <ThemedText type="small" themeColor="primary">
                        {venue.email}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <VenueReviews venueId={venue.id} />
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  // Mounted but off-canvas so captureRef always has a laid-out view to
  // photograph — same technique as post-card.tsx's ShareCard.
  shareCardOffscreen: {
    position: 'absolute',
    top: 0,
    left: -2000,
  },
  container: {
    flex: 1,
  },
  scroll: {
    paddingBottom: Spacing.six,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  cover: {
    height: 220,
  },
  galleryScroll: {
    flex: 1,
  },
  coverImage: {
    height: 220,
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryDots: {
    position: 'absolute',
    bottom: Spacing.three,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  galleryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  favoriteButton: {
    position: 'absolute',
    top: Spacing.three,
    right: Spacing.three,
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  titleBlock: {
    gap: Spacing.one,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  directionsLink: {
    marginTop: Spacing.one,
    alignSelf: 'flex-start',
  },
  pill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  block: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  courtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  courtInfo: {
    flexShrink: 1,
    gap: Spacing.half,
  },
  chipStrip: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingRight: Spacing.two,
  },
  metaLabel: {
    letterSpacing: 1.2,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.half,
  },
});
