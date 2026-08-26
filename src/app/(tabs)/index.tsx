import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterSheet } from '@/components/filter-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Skeleton } from '@/components/ui/skeleton';
import { VenueCard } from '@/components/venue-card';
import { VenueRequestForm } from '@/components/venue-request-form';
import { Wordmark } from '@/components/wordmark';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useKeyboardAwareScroll } from '@/hooks/use-keyboard-aware-scroll';
import { useTheme } from '@/hooks/use-theme';
import type { Amenity } from '@/lib/database.types';
import { addFavorite, listFavoriteVenueIds, removeFavorite } from '@/lib/favorites';
import {
  listAmenities,
  listMarketplaceVenues,
  listSurfaceTypes,
  type MarketplaceFilters,
  type MarketplaceVenue,
} from '@/lib/venues';
import { useSession } from '@/providers/session';

function countActiveFilters(filters: MarketplaceFilters): number {
  let count = 0;
  if (filters.indoorOutdoor) count += 1;
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) count += 1;
  if (filters.minRating) count += 1;
  if (filters.amenityIds && filters.amenityIds.length > 0) count += 1;
  if (filters.surfaceType) count += 1;
  if (filters.availableOn) count += 1;
  return count;
}

export default function ExploreScreen() {
  const theme = useTheme();
  const { ref: listRef, props: keyboardProps, scrollFocusedIntoView } = useKeyboardAwareScroll<FlatList>();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [venues, setVenues] = useState<MarketplaceVenue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<MarketplaceFilters>({});
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [surfaceTypes, setSurfaceTypes] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const requestSeq = useRef(0);

  const load = useCallback(async (q: string, activeFilters: MarketplaceFilters) => {
    const seq = ++requestSeq.current;
    try {
      const rows = await listMarketplaceVenues({ ...activeFilters, q });
      // A stale response (older search) must never overwrite a newer one.
      if (seq === requestSeq.current) {
        setVenues(rows);
        setError(null);
      }
    } catch {
      if (seq === requestSeq.current) {
        setError("Couldn't load venues. Pull to retry.");
      }
    }
  }, []);

  useEffect(() => {
    listAmenities().then(setAmenities).catch(() => {});
    listSurfaceTypes().then(setSurfaceTypes).catch(() => {});
  }, []);

  useEffect(() => {
    if (!userId) {
      setFavoriteIds(new Set());
      return;
    }
    listFavoriteVenueIds(userId)
      .then((ids) => setFavoriteIds(new Set(ids)))
      .catch(() => {});
  }, [userId]);

  // Debounced search — fires 300ms after the last keystroke. Filter and
  // sort changes apply immediately (the sheet's own Apply button is
  // already the debounce for those).
  useEffect(() => {
    const handle = setTimeout(() => {
      load(search, filters);
    }, 300);
    return () => clearTimeout(handle);
  }, [search, filters, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(search, filters);
    setRefreshing(false);
  }, [load, search, filters]);

  const toggleFavorite = async (venueId: string) => {
    if (!userId) return;
    const wasFavorited = favoriteIds.has(venueId);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (wasFavorited) next.delete(venueId);
      else next.add(venueId);
      return next;
    });
    try {
      if (wasFavorited) {
        await removeFavorite(userId, venueId);
      } else {
        await addFavorite(userId, venueId);
      }
    } catch {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorited) next.add(venueId);
        else next.delete(venueId);
        return next;
      });
    }
  };

  const activeFilterCount = countActiveFilters(filters);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          ref={listRef}
          {...keyboardProps}
            data={venues ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <VenueCard
                venue={item}
                isFavorited={favoriteIds.has(item.id)}
                onToggleFavorite={userId ? () => toggleFavorite(item.id) : undefined}
              />
            )}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.header}>
                <Wordmark size={22} />
                <ThemedText type="title">Find a court</ThemedText>
                <View style={styles.searchRow}>
                  <View
                    style={[
                      styles.searchPill,
                      { backgroundColor: theme.card, borderColor: theme.input },
                    ]}>
                    <Ionicons name="search" size={18} color={theme.mutedForeground} />
                    <TextInput
                      onFocus={scrollFocusedIntoView}
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Venue, court, city, or barangay"
                      placeholderTextColor={theme.placeholder}
                      autoCapitalize="none"
                      returnKeyType="search"
                      style={[styles.searchInput, { color: theme.cardForeground }]}
                    />
                    {search.length > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Clear search"
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        onPress={() => setSearch('')}>
                        <Ionicons name="close-circle" size={18} color={theme.mutedForeground} />
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'
                    }
                    onPress={() => setFilterSheetVisible(true)}
                    style={[
                      styles.filterButton,
                      { backgroundColor: activeFilterCount > 0 ? theme.secondary : theme.card, borderColor: theme.input },
                    ]}>
                    <Ionicons name="options-outline" size={20} color={activeFilterCount > 0 ? theme.secondaryForeground : theme.foreground} />
                    {activeFilterCount > 0 ? (
                      <View style={[styles.filterBadge, { backgroundColor: theme.primary }]}>
                        <ThemedText type="caption" style={{ color: theme.primaryForeground, lineHeight: 16 }}>
                          {activeFilterCount}
                        </ThemedText>
                      </View>
                    ) : null}
                  </Pressable>
                </View>
                {error ? (
                  <ThemedText type="small" themeColor="destructive">
                    {error}
                  </ThemedText>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              venues === null ? (
                <View style={styles.skeletons}>
                  <Skeleton height={230} radius={Radius.xl} />
                  <Skeleton height={230} radius={Radius.xl} />
                </View>
              ) : userId ? (
                <VenueRequestForm
                  key={search || activeFilterCount > 0 ? 'searching' : 'empty'}
                  userId={userId}
                  variant={search || activeFilterCount > 0 ? 'searching' : 'empty'}
                  initialPlaceName={search.trim()}
                />
              ) : (
                <View
                  style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <ThemedText type="subtitle">No venues found</ThemedText>
                  <ThemedText type="small" themeColor="subtle">
                    {search || activeFilterCount > 0
                      ? 'Try a different name, area, or fewer filters.'
                      : 'Venues appear here as owners come aboard.'}
                  </ThemedText>
                </View>
              )
            }
          />

      </SafeAreaView>

      <FilterSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        filters={filters}
        onApply={setFilters}
        amenities={amenities}
        surfaceTypes={surfaceTypes}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  list: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.five,
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  filterButton: {
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  skeletons: {
    gap: Spacing.three,
  },
  empty: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
