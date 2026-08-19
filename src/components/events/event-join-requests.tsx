import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { approveEventJoin, rejectEventJoin, type PendingJoinRequest } from '@/lib/events';

/**
 * The event creator's queue of pending join requests. Approve seats them
 * (or waitlists them, if the event filled up while the request sat
 * pending) via enforce_event_capacity(); decline sets them to cancelled,
 * identical to a player leaving on their own.
 */
export function EventJoinRequests({
  eventId,
  requests,
  onResolved,
}: {
  eventId: string;
  requests: PendingJoinRequest[];
  onResolved: () => void;
}) {
  const theme = useTheme();
  const { show } = useToast();
  const [actingOn, setActingOn] = useState<string | null>(null);

  if (requests.length === 0) return null;

  const respond = async (requesterId: string, decision: 'approve' | 'reject') => {
    setActingOn(requesterId);
    try {
      if (decision === 'approve') {
        const status = await approveEventJoin(eventId, requesterId);
        show(status === 'waitlisted' ? "Approved — they're on the waitlist, the game is full." : "Approved — they're in.");
      } else {
        await rejectEventJoin(eventId, requesterId);
        show('Request declined.');
      }
      onResolved();
    } catch {
      show("Couldn't update that request. Try again.", 'error');
    } finally {
      setActingOn(null);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <ThemedText type="smallBold">
        Join requests <ThemedText type="small" themeColor="mutedForeground">({requests.length})</ThemedText>
      </ThemedText>
      {requests.map((request) => (
        <View key={request.userId} style={[styles.row, { borderColor: theme.border }]}>
          <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
            <ThemedText type="caption" style={{ color: theme.accentForeground }}>
              {(request.profile?.display_name ?? '?').slice(0, 1).toUpperCase()}
            </ThemedText>
          </View>
          <ThemedText type="small" style={styles.name} numberOfLines={1}>
            {request.profile?.display_name ?? 'A player'}
          </ThemedText>
          <Button
            title="Approve"
            style={styles.compactButton}
            onPress={() => respond(request.userId, 'approve')}
            disabled={actingOn === request.userId}
            loading={actingOn === request.userId}
          />
          <Button
            title="Decline"
            variant="outline"
            style={styles.compactButton}
            onPress={() => respond(request.userId, 'reject')}
            disabled={actingOn === request.userId}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.two,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
  },
  compactButton: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
  },
});
