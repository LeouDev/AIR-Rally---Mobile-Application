import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { EventJoinRequests } from '@/components/events/event-join-requests';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import type { EventAttendeeStatus } from '@/lib/database.types';
import { useTheme } from '@/hooks/use-theme';
import { calculateSplit, formatShare } from '@/lib/event-split';
import {
  getEventDetail,
  joinEvent,
  leaveEvent,
  listMyEventStatuses,
  listPendingJoinRequests,
  type EventDetail,
  type PendingJoinRequest,
} from '@/lib/events';
import { useSession } from '@/providers/session';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function EventDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [event, setEvent] = useState<EventDetail | null | undefined>(undefined);
  const [myStatus, setMyStatus] = useState<EventAttendeeStatus | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingJoinRequest[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isOrganiser = userId != null && event?.creator_id === userId;

  const load = useCallback(() => {
    if (!id) return;
    getEventDetail(id)
      .then((detail) => {
        setEvent(detail);
        if (detail && userId) {
          listMyEventStatuses(userId, [id]).then((statuses) => setMyStatus(statuses.get(id) ?? null));
          if (detail.creator_id === userId) {
            listPendingJoinRequests(id).then(setPendingRequests);
          }
        }
      })
      .catch(() => setEvent(null));
  }, [id, userId]);

  useFocusEffect(load);

  const toggleJoin = async () => {
    if (!id || !userId || working) return;
    setWorking(true);
    setMessage(null);
    try {
      const active = myStatus === 'joined' || myStatus === 'waitlisted' || myStatus === 'pending_approval';
      if (active) {
        await leaveEvent(userId, id);
        setMessage(myStatus === 'pending_approval' ? 'Request withdrawn.' : "You've left this game.");
      } else {
        const status = await joinEvent(userId, id);
        setMessage(
          status === 'waitlisted'
            ? "You're on the waitlist — we'll move you up if a spot opens."
            : status === 'pending_approval'
              ? 'Request sent — the organiser will review it.'
              : "You're in. Sort out your share with the organiser."
        );
      }
      load();
    } catch {
      setMessage("That didn't work — try again.");
    } finally {
      setWorking(false);
    }
  };

  const seated = event ? Math.max(event.attendees.length, 1) : 1;
  const split = event ? calculateSplit(event.price_amount, seated) : null;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Game', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {event === undefined ? (
            <View style={styles.block}>
              <Skeleton height={28} width="70%" radius={Radius.sm} />
              <Skeleton height={100} radius={Radius.xl} />
            </View>
          ) : event === null ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText type="subtitle">This game isn&apos;t available</ThemedText>
            </View>
          ) : (
            <>
              <View style={styles.block}>
                <ThemedText type="heading">{event.title}</ThemedText>
                {event.creator ? (
                  <ThemedText type="small" themeColor="subtle">
                    Organised by {event.creator.display_name ?? 'a player'}
                    {isOrganiser ? ' (you)' : ''}
                  </ThemedText>
                ) : null}
              </View>

              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="small">{formatWhen(event.start_time)}</ThemedText>
                {event.venue ? (
                  <ThemedText type="small">
                    {[event.venue.name, event.venue.city].filter(Boolean).join(', ')}
                  </ThemedText>
                ) : null}
                <ThemedText type="small">
                  {event.attendees.length}
                  {event.max_players ? ` of ${event.max_players}` : ''} playing
                  {event.isFull ? ' · full' : ''}
                </ThemedText>
              </View>

              {event.description ? (
                <ThemedText type="small" themeColor="subtle">
                  {event.description}
                </ThemedText>
              ) : null}

              {event.price_amount > 0 && split ? (
                <View style={[styles.card, { backgroundColor: theme.muted, borderColor: theme.border }]}>
                  <ThemedText type="caption" themeColor="mutedForeground">
                    Court total
                  </ThemedText>
                  <ThemedText type="subtitle">{formatShare(event.price_amount)}</ThemedText>
                  <ThemedText type="small">
                    <ThemedText type="smallBold">{formatShare(split.sharePerPlayer)}</ThemedText> each, split{' '}
                    {split.playerCount} ways
                  </ThemedText>
                  <ThemedText type="caption" themeColor="mutedForeground">
                    {event.creator?.display_name ?? 'The organiser'} paid the venue for the whole court. Settle your
                    share directly with them — AIR/Rally doesn&apos;t collect it.
                  </ThemedText>
                </View>
              ) : null}

              <View style={styles.block}>
                <ThemedText type="smallBold">Playing</ThemedText>
                {event.attendees.length > 0 ? (
                  <View style={styles.chipRow}>
                    {event.attendees.map((player) => (
                      <View key={player.id} style={[styles.playerChip, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
                          <ThemedText type="caption" style={{ color: theme.accentForeground }}>
                            {(player.display_name ?? '?').slice(0, 1).toUpperCase()}
                          </ThemedText>
                        </View>
                        <ThemedText type="small">{player.display_name}</ThemedText>
                      </View>
                    ))}
                  </View>
                ) : (
                  <ThemedText type="small" themeColor="subtle">
                    Nobody has confirmed yet.
                  </ThemedText>
                )}
              </View>

              {message ? (
                <ThemedText type="small" themeColor="subtle">
                  {message}
                </ThemedText>
              ) : null}

              {isOrganiser ? (
                <>
                  <EventJoinRequests eventId={id} requests={pendingRequests} onResolved={load} />
                  <View style={[styles.card, { backgroundColor: theme.muted, borderColor: theme.border }]}>
                    <ThemedText type="small" themeColor="subtle" style={styles.center}>
                      You&apos;re organising this game.
                    </ThemedText>
                  </View>
                </>
              ) : userId ? (
                <Button
                  title={
                    working
                      ? 'Working…'
                      : myStatus === 'pending_approval'
                        ? 'Cancel request'
                        : myStatus === 'waitlisted'
                          ? 'Leave the waitlist'
                          : myStatus === 'joined'
                            ? 'Leave this game'
                            : event.isFull
                              ? 'Ask to join the waitlist'
                              : 'Ask to join'
                  }
                  variant={myStatus ? 'secondary' : 'primary'}
                  onPress={toggleJoin}
                  disabled={working}
                  loading={working}
                />
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
    gap: Spacing.one,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  playerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingLeft: Spacing.one,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
