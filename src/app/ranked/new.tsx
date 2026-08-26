import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RankedPartyBuilder } from '@/components/ranked/ranked-party-builder';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import type { PublicProfile, RankedMatchType } from '@/lib/database.types';
import { getPublicProfile } from '@/lib/follows';
import { useSession } from '@/providers/session';

/**
 * Build a ranked party for an event already underway — the bridge from
 * a game screen's "Start a Ranked match here", mirroring the web's
 * `/ranked/new?event=&court=` (src/app/(marketing)/ranked/new/page.tsx).
 * The web also has a de-emphasized standalone entry point with neither
 * param, for a match played on a court AIR/Rally never booked — this
 * screen doesn't build that; it only serves the one bridge the game
 * screen offers, which always supplies both.
 */
export default function RankedNewMatchScreen() {
  const { event, court, type } = useLocalSearchParams<{ event?: string; court?: string; type?: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [matchType, setMatchType] = useState<RankedMatchType>(type === 'doubles' ? 'doubles' : 'singles');
  const [host, setHost] = useState<PublicProfile | null | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    getPublicProfile(userId)
      .then(setHost)
      .catch(() => setHost(null));
  }, [userId]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Build your party', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {!event || !court ? (
            <ThemedText type="small" themeColor="subtle">
              This link is missing the game it belongs to.
            </ThemedText>
          ) : host === undefined ? (
            <Skeleton height={220} radius={Radius.xl} />
          ) : host === null ? (
            <ThemedText type="small" themeColor="subtle">
              We couldn&apos;t load your profile. Try again in a moment.
            </ThemedText>
          ) : (
            <>
              <View style={styles.block}>
                <ThemedText type="smallBold">Singles or doubles?</ThemedText>
                <SegmentedControl
                  options={[
                    { value: 'singles', label: 'Singles' },
                    { value: 'doubles', label: 'Doubles' },
                  ]}
                  selected={matchType}
                  onSelect={setMatchType}
                />
              </View>
              <RankedPartyBuilder
                key={matchType}
                host={host}
                matchType={matchType}
                eventId={event}
                courtId={court}
                onCreated={(matchId) => router.replace({ pathname: '/ranked/[matchId]', params: { matchId } })}
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  block: {
    gap: Spacing.two,
  },
});
