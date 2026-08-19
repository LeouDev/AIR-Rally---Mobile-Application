import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Club } from '@/lib/database.types';
import { listClubsForUser, listDiscoverableClubs } from '@/lib/clubs';
import { useSession } from '@/providers/session';

const SKILL_LABELS: Record<Club['skill_level'], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  mixed: 'All levels',
};

const TYPE_LABELS: Record<Club['club_type'], string> = {
  social: 'Social',
  competitive: 'Competitive',
  training: 'Training',
  casual: 'Casual',
};

function ClubCard({ club }: { club: Club }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/clubs/[id]', params: { id: club.id } })}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.92 : 1 },
      ]}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold" style={styles.cardTitle} numberOfLines={1}>
          {club.name}
        </ThemedText>
        {club.visibility !== 'public' ? (
          <ThemedText type="caption" themeColor="mutedForeground">
            🔒
          </ThemedText>
        ) : null}
      </View>
      {club.description ? (
        <ThemedText type="small" themeColor="subtle" numberOfLines={2}>
          {club.description}
        </ThemedText>
      ) : null}
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
          <ThemedText type="caption" style={{ color: theme.accentForeground }}>
            {SKILL_LABELS[club.skill_level]}
          </ThemedText>
        </View>
        <View style={[styles.badge, { borderWidth: 1, borderColor: theme.border }]}>
          <ThemedText type="caption">{TYPE_LABELS[club.club_type]}</ThemedText>
        </View>
      </View>
      <ThemedText type="caption" themeColor="mutedForeground">
        {club.member_count} {club.member_count === 1 ? 'member' : 'members'}
        {club.location ? ` · ${club.location}` : ''}
      </ThemedText>
    </Pressable>
  );
}

export default function ClubsScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [discoverable, setDiscoverable] = useState<Club[] | null>(null);
  const [myClubs, setMyClubs] = useState<Club[]>([]);

  const load = useCallback(async () => {
    const [discoverableRows, myRows] = await Promise.all([
      listDiscoverableClubs(),
      userId ? listClubsForUser(userId) : Promise.resolve([]),
    ]);
    setDiscoverable(discoverableRows);
    setMyClubs(myRows);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const myClubIds = new Set(myClubs.map((c) => c.id));
  const others = (discoverable ?? []).filter((c) => !myClubIds.has(c.id));

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Clubs', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="small" themeColor="subtle">
            Find your regular crew, or start one of your own.
          </ThemedText>
          <Button title="Create a club" onPress={() => router.push('/clubs/new')} />

          {myClubs.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="smallBold">Your clubs</ThemedText>
              <View style={styles.list}>
                {myClubs.map((club) => (
                  <ClubCard key={club.id} club={club} />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <ThemedText type="smallBold">{myClubs.length > 0 ? 'Discover more' : 'Discover clubs'}</ThemedText>
            {discoverable === null ? (
              <View style={styles.list}>
                <Skeleton height={110} radius={Radius.xl} />
                <Skeleton height={110} radius={Radius.xl} />
              </View>
            ) : others.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">No clubs to show yet</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Clubs are player-run communities. Start one and invite the people you already play with.
                </ThemedText>
              </View>
            ) : (
              <View style={styles.list}>
                {others.map((club) => (
                  <ClubCard key={club.id} club={club} />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
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
  scroll: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  section: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  list: {
    gap: Spacing.three,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardTitle: {
    flexShrink: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  emptyCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
