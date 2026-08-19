import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Skeleton } from '@/components/ui/skeleton';
import { VenueCard } from '@/components/venue-card';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { VenueMarketplaceRow } from '@/lib/database.types';
import { listFavoriteVenues, removeFavorite } from '@/lib/favorites';
import { useSession } from '@/providers/session';

export default function FavoritesScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [venues, setVenues] = useState<VenueMarketplaceRow[] | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    listFavoriteVenues(userId)
      .then(setVenues)
      .catch(() => setVenues([]));
  }, [userId]);

  useFocusEffect(load);

  const toggleFavorite = async (venueId: string) => {
    if (!userId) return;
    setVenues((prev) => prev?.filter((v) => v.id !== venueId) ?? prev);
    try {
      await removeFavorite(userId, venueId);
    } catch {
      load();
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Saved courts', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={venues ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <VenueCard venue={item} isFavorited onToggleFavorite={() => toggleFavorite(item.id)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.five }} />}
          ListEmptyComponent={
            venues === null ? (
              <View style={styles.skeletons}>
                <Skeleton height={230} radius={Radius.xl} />
                <Skeleton height={230} radius={Radius.xl} />
              </View>
            ) : (
              <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">No saved courts yet</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Tap the heart on a venue to save it here.
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
  },
  list: {
    padding: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
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
