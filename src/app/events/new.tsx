import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerPicker } from '@/components/player-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PublicProfile } from '@/lib/database.types';
import { formatShare } from '@/lib/event-split';
import { createOpenPlayForBooking, listHostableBookings, type HostableBooking } from '@/lib/events';
import { useSession } from '@/providers/session';

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

  const [bookings, setBookings] = useState<HostableBooking[] | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [players, setPlayers] = useState<PublicProfile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    listHostableBookings(userId)
      .then((rows) => {
        setBookings(rows);
        const firstAvailable = rows.find((b) => !b.existingEventId);
        setBookingId(firstAvailable?.bookingId ?? null);
      })
      .catch(() => setBookings([]));
  }, [userId]);

  const available = (bookings ?? []).filter((b) => !b.existingEventId);
  const selected = (bookings ?? []).find((b) => b.bookingId === bookingId) ?? null;

  const submit = async () => {
    if (!userId || !bookingId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createOpenPlayForBooking(userId, {
        bookingId,
        playerIds: players.map((p) => p.id),
        title: title.trim() || undefined,
      });
      router.replace({ pathname: '/events/[id]', params: { id: result.eventId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't set up that game.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Start a game', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <ThemedText type="small" themeColor="subtle">
            Invite your playmates to a court you&apos;ve booked. You pay the venue; splitting it is between you and
            them.
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
                Open Play runs on a court you&apos;ve booked. Book one, then come back and invite your playmates.
              </ThemedText>
              <Button title="Find a court" onPress={() => router.push('/(tabs)')} />
            </View>
          ) : available.length === 0 ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText type="subtitle">Every upcoming booking already has a game</ThemedText>
              {bookings.map((booking) => (
                <Pressable
                  key={booking.bookingId}
                  accessibilityRole="button"
                  onPress={() =>
                    booking.existingEventId &&
                    router.push({ pathname: '/events/[id]', params: { id: booking.existingEventId } })
                  }>
                  <ThemedText type="small" themeColor="primary">
                    {booking.venueName} · {formatWhen(booking.startTime)}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : (
            <>
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
                        onPress={() => setBookingId(booking.bookingId)}
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
                <PlayerPicker
                  selected={players}
                  onChange={setPlayers}
                  totalAmount={selected.priceAmount}
                  currency={selected.currency}
                  excludeUserId={userId}
                />
              ) : null}

              {selected && players.length > 0 && selected.priceAmount > 0 ? (
                <ThemedText type="caption" themeColor="mutedForeground">
                  You&apos;ve already paid {formatShare(selected.priceAmount, selected.currency)} for this court.
                  Collect each player&apos;s share from your group directly, however you like.
                </ThemedText>
              ) : null}

              {error ? (
                <ThemedText type="small" themeColor="destructive">
                  {error}
                </ThemedText>
              ) : null}

              <Button
                title={submitting ? 'Creating…' : players.length > 0 ? `Create game and invite ${players.length}` : 'Create game'}
                onPress={submit}
                disabled={submitting || !bookingId}
                loading={submitting}
              />
            </>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
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
  flex: {
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
});
