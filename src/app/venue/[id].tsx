import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BookingPanel } from '@/components/booking-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { condensedSchedule, getVenueDetail, publicImageUrl, type VenueDetail } from '@/lib/venues';

export default function VenueDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [venue, setVenue] = useState<VenueDetail | null | undefined>(undefined);

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

  const coverPath = venue?.imagePaths[0] ?? venue?.cover_image_path ?? null;

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
        }}
      />
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
            <View style={[styles.cover, { backgroundColor: theme.muted }]}>
              {coverPath ? (
                <Image
                  source={{ uri: publicImageUrl(coverPath) }}
                  style={styles.coverImage}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View style={styles.coverFallback}>
                  <ThemedText type="title" themeColor="mutedForeground">
                    {venue.name.slice(0, 1).toUpperCase()}
                  </ThemedText>
                </View>
              )}
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
                    <ThemedText type="smallBold">
                      ★ {venue.average_rating.toFixed(1)}{' '}
                      <ThemedText type="small" themeColor="mutedForeground">
                        ({venue.review_count} {venue.review_count === 1 ? 'review' : 'reviews'})
                      </ThemedText>
                    </ThemedText>
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
                    {venue.amenities.map((amenity) => (
                      <View
                        key={amenity.id}
                        style={[styles.pill, { backgroundColor: theme.neutralSoft }]}>
                        <ThemedText type="caption" style={{ color: theme.neutralSoftForeground }}>
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
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
  coverImage: {
    flex: 1,
  },
  coverFallback: {
    flex: 1,
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
