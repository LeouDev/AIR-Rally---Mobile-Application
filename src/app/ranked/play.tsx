import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalibrationStatus } from '@/components/ranked/calibration-status';
import { RankedDirectInvite } from '@/components/ranked/ranked-direct-invite';
import { RatingFreezeSheet } from '@/components/ranked/rating-freeze-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useKeyboardAwareScroll } from '@/hooks/use-keyboard-aware-scroll';
import { useTheme } from '@/hooks/use-theme';
import type { PlayerRank, PublicProfile } from '@/lib/database.types';
import { getPublicProfile } from '@/lib/follows';
import { acknowledgeUnbookedPlay, getUnbookedPlayAcknowledged } from '@/lib/profile';
import { getPlayerRank, rankedStakes } from '@/lib/ranked';
import { useSession } from '@/providers/session';

type GameMode = 'casual' | 'ranked';

/**
 * The booking-free doorway — the founder's own words: casual is "free
 * play... your wins will be recorded and losses but your rank won't be
 * subtracted or added even if you lose or win," ranked's first ten
 * matches are calibration and need no booking either (067's own DB
 * comment: "the ladder does not require [event/court]... four people
 * on any court can play one"). Two ways to fill a match, format derived
 * from who shows up rather than a toggle (Open Match design, 2026-08-31):
 * broadcast to the city via Find match, or invite specific players via
 * RankedDirectInvite — the latter still creates the match directly
 * (create_ranked_match, via RankedDirectInvite's own null eventId/
 * courtId handling), same as the old slot-based builder did.
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
  const [host, setHost] = useState<PublicProfile | null | undefined>(undefined);
  const [myRank, setMyRank] = useState<PlayerRank | null | undefined>(undefined);
  const [freezeSheetVisible, setFreezeSheetVisible] = useState(false);
  // Whether the open sheet is gating a pending "Find match" submit
  // (Cancel/Play anyway) or just answering the on-screen line's tap
  // (a single Close) — see RatingFreezeSheet's own `onConfirm`.
  const [freezeConfirmMode, setFreezeConfirmMode] = useState(false);
  // A native Promise's resolve, once called, ignores every later call —
  // so "Play anyway" resolving true and the sheet's own onClose
  // resolving false right after it can both fire unconditionally
  // without a second flag to track which already happened.
  const confirmResolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  // Starts false (show the dialog) rather than undefined/loading —
  // worst case before the real value arrives is one dialog a returning
  // player didn't strictly need to see again, never a skipped one.
  const [acknowledgedUnbookedPlay, setAcknowledgedUnbookedPlay] = useState(false);

  function confirmBeforeUnbookedMatch(): Promise<boolean> {
    if (acknowledgedUnbookedPlay) return Promise.resolve(true);
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
      setFreezeConfirmMode(true);
      setFreezeSheetVisible(true);
    });
  }

  function closeFreezeSheet() {
    confirmResolveRef.current?.(false);
    confirmResolveRef.current = null;
    setFreezeSheetVisible(false);
  }

  function confirmFreezeSheet() {
    // Resolve first — the match proceeds on the strength of this tap
    // alone. The write below is best-effort and never awaited here: a
    // failed write must cost a repeated dialog next session, never a
    // blocked or delayed match now (acknowledgeUnbookedPlay swallows
    // its own errors for the same reason).
    confirmResolveRef.current?.(true);
    confirmResolveRef.current = null;
    setAcknowledgedUnbookedPlay(true);
    if (userId) void acknowledgeUnbookedPlay(userId);
  }

  useEffect(() => {
    if (!userId) return;
    getPublicProfile(userId)
      .then(setHost)
      .catch(() => setHost(null));
    getPlayerRank(userId)
      .then(setMyRank)
      .catch(() => setMyRank(null));
    getUnbookedPlayAcknowledged(userId).then(setAcknowledgedUnbookedPlay);
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
                {/* Navy for all three things this card can hold — Casual,
                    calibrating, and calibrated — per the founder's own
                    reasoning: toggling Casual/Ranked shouldn't change the
                    card's colour underneath them. */}
                <View style={[styles.stakesCard, { backgroundColor: theme.navy, borderColor: theme.navy }]}>
                  {mode === 'ranked' ? (
                    <>
                      <CalibrationStatus rank={myRank} surface="navy" />
                      {isCalibrated ? (
                        <ThemedText type="small" style={{ color: `${theme.navyForeground}CC` }}>
                          Rating moves at half rate without a booked court.{' '}
                          <ThemedText
                            type="small"
                            themeColor="primary"
                            accessibilityRole="button"
                            onPress={() => {
                              setFreezeConfirmMode(false);
                              setFreezeSheetVisible(true);
                            }}
                            style={styles.freezeLink}>
                            Your court not here?
                          </ThemedText>
                        </ThemedText>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <ThemedText type="caption" style={[styles.stakesHeadline, { color: `${theme.navyForeground}CC` }]}>
                        {stakes.headline.toUpperCase()}
                      </ThemedText>
                      <ThemedText type="small" style={{ color: `${theme.navyForeground}CC` }}>
                        {stakes.detail}
                      </ThemedText>
                    </>
                  )}
                </View>
              </View>

              <View style={styles.block}>
                <ThemedText type="smallBold">Broadcast to your city</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Post a game and let nearby players request to join — no need to know who&apos;s coming yet.
                </ThemedText>
                <Button title="Find match" onPress={() => router.push('/open-match/new')} />
              </View>

              <View style={[styles.block, styles.sectionDivider, { borderTopColor: theme.border }]}>
                <ThemedText type="smallBold">Or invite players you know</ThemedText>
                <RankedDirectInvite
                  key={mode}
                  host={host}
                  rated={mode === 'ranked'}
                  onSearchFocus={scrollFocusedIntoView}
                  onCreated={(matchId) => router.replace({ pathname: '/ranked/[matchId]', params: { matchId } })}
                  confirmBeforeCreate={mode === 'ranked' && isCalibrated ? confirmBeforeUnbookedMatch : undefined}
                />
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      {userId ? (
        <RatingFreezeSheet
          visible={freezeSheetVisible}
          onClose={closeFreezeSheet}
          userId={userId}
          onConfirm={freezeConfirmMode ? confirmFreezeSheet : undefined}
        />
      ) : null}
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
  sectionDivider: {
    borderTopWidth: 1,
    paddingTop: Spacing.four,
    marginTop: Spacing.two,
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
  freezeLink: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
