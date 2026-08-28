import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalibrationStatus } from '@/components/ranked/calibration-status';
import { RankedPartyBuilder } from '@/components/ranked/ranked-party-builder';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useKeyboardAwareScroll } from '@/hooks/use-keyboard-aware-scroll';
import { useTheme } from '@/hooks/use-theme';
import type { PlayerRank, PublicProfile, RankedMatchType } from '@/lib/database.types';
import { getPublicProfile } from '@/lib/follows';
import { getPlayerRank, rankedStakes } from '@/lib/ranked';
import { useSession } from '@/providers/session';

type GameMode = 'casual' | 'ranked';

/**
 * The booking-free doorway — the founder's own words: casual is "free
 * play... your wins will be recorded and losses but your rank won't be
 * subtracted or added even if you lose or win," ranked's first ten
 * matches are calibration and need no booking either (067's own DB
 * comment: "the ladder does not require [event/court]... four people
 * on any court can play one"). Everything a booking-gated match already
 * needed (a real party, singles/doubles) still applies — this only
 * removes the booking precondition, via RankedPartyBuilder's own
 * already-correct handling of a null eventId/courtId.
 *
 * NOT a replacement for the booked flow at events/new.tsx — a player
 * who's booked a court still starts a game from that booking, same as
 * today. This is a second doorway for the player the strategy is
 * actually about: no bookings, no venue nearby yet, wants to play with
 * friends on whatever public court they can find.
 */
export default function PlayRankedScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { ref: scrollRef, props: keyboardProps, scrollFocusedIntoView } = useKeyboardAwareScroll<ScrollView>();

  const [mode, setMode] = useState<GameMode>('ranked');
  const [matchType, setMatchType] = useState<RankedMatchType>('singles');
  const [host, setHost] = useState<PublicProfile | null | undefined>(undefined);
  const [myRank, setMyRank] = useState<PlayerRank | null | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    getPublicProfile(userId)
      .then(setHost)
      .catch(() => setHost(null));
    getPlayerRank(userId)
      .then(setMyRank)
      .catch(() => setMyRank(null));
  }, [userId]);

  // Nobody has ever calibrated before their first match — a brand new
  // player's absent rank means "not calibrated yet", the same starting
  // point every player has, not an error state.
  const isCalibrated = myRank?.is_calibrated ?? false;
  // No booking exists on this screen by construction — there's nothing
  // to ask the server about, unlike the lobby, which re-checks a real
  // match's actual booking once one exists.
  const stakes = rankedStakes({ rated: mode === 'ranked', booked: false, isCalibrated });

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Play a game', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} {...keyboardProps}>
          {host === undefined || myRank === undefined ? (
            <Skeleton height={280} radius={Radius.xl} />
          ) : host === null ? (
            <ThemedText type="small" themeColor="subtle">
              We couldn&apos;t load your profile. Try again in a moment.
            </ThemedText>
          ) : (
            <>
              <View style={styles.block}>
                <ThemedText type="smallBold">Game type</ThemedText>
                <SegmentedControl
                  options={[
                    { value: 'casual', label: 'Casual' },
                    { value: 'ranked', label: 'Ranked' },
                  ]}
                  selected={mode}
                  onSelect={setMode}
                />
                <View style={[styles.stakesCard, { backgroundColor: theme.muted, borderColor: theme.border }]}>
                  {mode === 'ranked' ? (
                    <>
                      <CalibrationStatus rank={myRank} />
                      {/* Once calibrated, this screen still has no booking (booked
                          is hardcoded false above) — rankedStakes' own warning that
                          the result won't move their rating still applies and would
                          otherwise silently disappear behind the new rank/ARR display. */}
                      {isCalibrated ? (
                        <ThemedText type="small" themeColor="subtle">
                          {stakes.detail}
                        </ThemedText>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <ThemedText type="caption" themeColor="mutedForeground" style={styles.stakesHeadline}>
                        {stakes.headline.toUpperCase()}
                      </ThemedText>
                      <ThemedText type="small" themeColor="subtle">
                        {stakes.detail}
                      </ThemedText>
                    </>
                  )}
                </View>
              </View>

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
                key={`${matchType}-${mode}`}
                host={host}
                matchType={matchType}
                rated={mode === 'ranked'}
                onSearchFocus={scrollFocusedIntoView}
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
  stakesCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 2,
  },
  stakesHeadline: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
