import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Skeleton } from '@/components/ui/skeleton';
import { VenueCard } from '@/components/venue-card';
import { Wordmark } from '@/components/wordmark';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { VenueMarketplaceRow } from '@/lib/database.types';
import { listMarketplaceVenues } from '@/lib/venues';

export default function ExploreScreen() {
  const theme = useTheme();
  const [venues, setVenues] = useState<VenueMarketplaceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const requestSeq = useRef(0);

  const load = useCallback(async (q: string) => {
    const seq = ++requestSeq.current;
    try {
      const rows = await listMarketplaceVenues(q);
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
    load('');
  }, [load]);

  // Debounced search — fires 300ms after the last keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      load(search);
    }, 300);
    return () => clearTimeout(handle);
  }, [search, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(search);
    setRefreshing(false);
  }, [load, search]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={venues ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <VenueCard venue={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.header}>
              <Wordmark size={22} />
              <ThemedText type="title">Find a court</ThemedText>
              <View
                style={[
                  styles.searchPill,
                  { backgroundColor: theme.card, borderColor: theme.input },
                ]}>
                <Ionicons name="search" size={18} color={theme.mutedForeground} />
                <TextInput
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
            ) : (
              <View
                style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">No venues found</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  {search
                    ? 'Try a different name or area.'
                    : 'Venues appear here as owners come aboard.'}
                </ThemedText>
              </View>
            )
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
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
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
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
