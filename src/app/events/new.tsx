import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RankedPartyBuilder } from '@/components/ranked/ranked-party-builder';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useKeyboardAwareScroll } from '@/hooks/use-keyboard-aware-scroll';
import { useTheme } from '@/hooks/use-theme';
import type { PublicProfile, RankedMatchType } from '@/lib/database.types';
import { formatShare } from '@/lib/event-split';
import { createOpenPlayForBooking, listHostableBookings, type HostableBooking } from '@/lib/events';
import { getPublicProfile } from '@/lib/follows';
import { rankedStakes } from '@/lib/ranked';
import { useSession } from '@/providers/session';

/**
 * Both modes build a structured 1v1/2v2 party through RankedPartyBuilder
 * now — casual and ranked differ only in `rated`. This REMOVED the old
 * casual path: an open PlayerPicker invite to an arbitrary-size group,
 * with no match structure and no recorded result. That capability is
 * gone deliberately, not by oversight — the founder confirmed it
 * explicitly on 2026-08-27 ("Yep that all set") after being asked
 * plainly whether they meant a structured match or wanted the loose-
 * group path kept. If a future gap between "casual" and "invite anyone
 * to hang out" shows up, it was a founder decision, not an omission —
 * restoring the loose path would be a new addition, not a revert.
 */
type GameMode = 'casual' | 'ranked';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function NewOpenPlayScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  // Set when a booking card's own "Start Game" already knows which
  // booking it means — falls back to the first available one below
  // when absent (reached generically, e.g. from the Play tab).
  const { bookingId: requestedBookingId } = useLocalSearchParams<{ bookingId?: string }>();

  const [bookings, setBookings] = useState<HostableBooking[] | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Both modes now build a structured 1v1/2v2 party through the same
  // RankedPartyBuilder — casual and ranked differ only in `rated`, not
  // in the flow. See partyEventId's own comment for why an Open Play
  // session shell has to exist before the party builder can run.
  const [mode, setMode] = useState<GameMode>('casual');
  const [matchType, setMatchType] = useState<RankedMatchType>('singles');
  const [hostProfile, setHostProfile] = useState<PublicProfile | null>(null);
  const [partyEventId, setPartyEventId] = useState<string | null>(null);
  const [startingMatch, setStartingMatch] = useState(false);
  const { ref: scrollRef, props: keyboardProps, scrollFocusedIntoView } = useKeyboardAwareScroll<ScrollView>();

  useEffect(() => {
    if (!userId) return;
    listHostableBookings(userId)
      .then((rows) => {
        setBookings(rows);
        const requested = requestedBookingId
          ? rows.find((b) => b.bookingId === requestedBookingId && !b.existingEventId)
          : undefined;
        const firstAvailable = rows.find((b) => !b.existingEventId);
        setBookingId(requested?.bookingId ?? firstAvailable?.bookingId ?? null);
      })
      .catch(() => setBookings([]));
  }, [userId, requestedBookingId]);

  useEffect(() => {
    if (!userId) return;
    getPublicProfile(userId)
      .then(setHostProfile)
      .catch(() => setHostProfile(null));
  }, [userId]);

  const available = (bookings ?? []).filter((b) => !b.existingEventId);
  const selected = (bookings ?? []).find((b) => b.bookingId === bookingId) ?? null;

  const selectBooking = (id: string) => {
    setBookingId(id);
    // A party already started belongs to the booking it was created
    // under — picking a different one starts fresh.
    setPartyEventId(null);
  };

  /**
   * Both modes' first step: the underlying Open Play session has to
   * exist — with a real id — before RankedPartyBuilder can hand that id
   * to create_ranked_match(). Once it does, the party builder replaces
   * this button and owns the rest of the flow (including its own
   * submit) — `rated` is the only thing that differs between casual and
   * ranked from here on.
   */
  const startMatch = async () => {
    if (!userId || !bookingId || startingMatch) return;
    setStartingMatch(true);
    setError(null);
    try {
      const result = await createOpenPlayForBooking(userId, {
        bookingId,
        playerIds: [],
        title: title.trim() || undefined,
      });
      setPartyEventId(result.eventId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't set up that game.");
    } finally {
      setStartingMatch(false);
    }
  };

  const handleMatchCreated = (matchId: string) => {
    router.replace({ pathname: '/ranked/[matchId]', params: { matchId } });
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Start a game', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {/* Was wrapped in KeyboardAvoidingView with no keyboardVerticalOffset,
            which under-compensates by the nav header height. Replaced rather
            than supplemented — two mechanisms competing for the same problem
            is how the next person loses an afternoon. */}
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} {...keyboardProps}>
          <ThemedText type="small" themeColor="subtle">
            Start a match on a court you&apos;ve booked. You pay the venue; splitting it is between you and them.
          </ThemedText>

          {bookings === null ? (
            <View style={styles.block}>
              <Skeleton height={80} radius={Radius.xl} />
              <Skeleton height={80} radius={Radius.xl} />
            </View>
          ) : bookings.length === 0 ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText type="subtitle">You need a court first</ThemedText>
              <ThemedText type="small" themeColor="subtle">
                Open Play runs on a court you&apos;ve booked, so other players can join it. Book one, then come back and
                invite your playmates.
              </ThemedText>
              {/* The way out, not just the way back. Someone reading this
                  has no booking — offering only "find a court" is a dead
                  end for a player with no venue near them. Playing needs
                  no booking; only Open Play does. */}
              <Button title="Start a game without a court" onPress={() => router.push('/ranked/play')} />
              <Button title="Find a court" variant="outline" onPress={() => router.push('/(tabs)')} />
            </View>
          ) : available.length === 0 ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText type="subtitle">Every upcoming booking already has a game</ThemedText>
              <ThemedText type="small" themeColor="subtle">
                Tap one to open its game instead of starting a new one.
              </ThemedText>
              <View style={styles.bookingList}>
                {bookings.map((booking) => (
                  <Pressable
                    key={booking.bookingId}
                    accessibilityRole="button"
                    onPress={() =>
                      booking.existingEventId &&
                      router.push({ pathname: '/events/[id]', params: { id: booking.existingEventId } })
                    }
                    style={({ pressed }) => [
                      styles.bookingRow,
                      styles.existingGameRow,
                      { backgroundColor: theme.muted, borderColor: theme.border },
                      pressed && { opacity: 0.7 },
                    ]}>
                    <ThemedText type="smallBold">
                      {booking.venueName} · {formatWhen(booking.startTime)}
                    </ThemedText>
                    <Ionicons name="chevron-forward" size={18} color={theme.mutedForeground} />
                  </Pressable>
                ))}
              </View>
            </View>
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
                  onSelect={(value) => {
                    setMode(value);
                    setPartyEventId(null);
                  }}
                />
                {(() => {
                  // A booked match never freezes — the freeze
                  // (20260810000100) only ever applies to an UNBOOKED
                  // ranked match, and this screen only ever creates
                  // booked ones. isCalibrated doesn't change which
                  // message shows here either way, so it's not fetched
                  // just to word this one line more precisely.
                  const stakes = rankedStakes({ rated: mode === 'ranked', booked: true, isCalibrated: true });
                  return (
                    <ThemedText type="caption" themeColor="mutedForeground">
                      {stakes.detail}
                    </ThemedText>
                  );
                })()}
              </View>

              <View style={styles.block}>
                <ThemedText type="smallBold">Which booking?</ThemedText>
                <ThemedText type="caption" themeColor="mutedForeground">
                  Open Play runs on a court you&apos;ve already booked and paid for.
                </ThemedText>
                <View style={styles.bookingList}>
                  {available.map((booking) => {
                    const active = booking.bookingId === bookingId;
                    return (
                      <Pressable
                        key={booking.bookingId}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        onPress={() => selectBooking(booking.bookingId)}
                        style={[
                          styles.bookingRow,
                          {
                            backgroundColor: active ? theme.accent : theme.card,
                            borderColor: active ? theme.primary : theme.border,
                          },
                        ]}>
                        <ThemedText type="smallBold">
                          {booking.venueName} · {booking.courtName}
                        </ThemedText>
                        <ThemedText type="caption" themeColor="mutedForeground">
                          {formatWhen(booking.startTime)} · {formatShare(booking.priceAmount, booking.currency)} court
                          total
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <TextField
                label="Game name (optional)"
                value={title}
                onChangeText={setTitle}
                maxLength={120}
                placeholder={selected ? `Open Play at ${selected.venueName}` : 'Open Play'}
              />

              {selected ? (
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

                  {error ? (
                    <ThemedText type="small" themeColor="destructive">
                      {error}
                    </ThemedText>
                  ) : null}

                  {partyEventId ? (
                    hostProfile ? (
                      <RankedPartyBuilder
                        key={`${matchType}-${mode}`}
                        host={hostProfile}
                        matchType={matchType}
                        eventId={partyEventId}
                        courtId={selected.courtId}
                        rated={mode === 'ranked'}
                        onSearchFocus={scrollFocusedIntoView}
                        onCreated={handleMatchCreated}
                      />
                    ) : (
                      <Skeleton height={220} radius={Radius.xl} />
                    )
                  ) : (
                    <Button
                      title={startingMatch ? 'Starting…' : mode === 'ranked' ? 'Start ranked match' : 'Start casual match'}
                      onPress={startMatch}
                      disabled={startingMatch || !bookingId}
                      loading={startingMatch}
                    />
                  )}
                </>
              ) : null}
            </>
          )}
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
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  block: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  bookingList: {
    gap: Spacing.two,
  },
  bookingRow: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 2,
  },
  existingGameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
