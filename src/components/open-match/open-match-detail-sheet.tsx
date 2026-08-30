import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/post-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  expiresInLabel,
  getMyJoinRequest,
  RankedError,
  requestToJoinOpenMatch,
  withdrawJoinRequest,
  type OpenMatchJoinRequest,
  type OpenMatchListing,
} from '@/lib/open-match';

/**
 * The viewer-side half of the join flow — request, withdraw, and see
 * your own request's status. Host-side management (accept/decline/kick,
 * seeing who's pending) is a separate screen, not this one: the design
 * is explicit that a requester never sees other requesters' identities
 * or outcomes, so this sheet only ever asks about ITS OWN viewer's row.
 *
 * `openMatch` is a snapshot from the browse list at the moment it was
 * tapped, not a live subscription — a host accepting/declining/kicking
 * while this sheet is open won't update mid-view. Close and reopen (or
 * the browse list's own next refetch) picks up the current state. Real-
 * time here is a later increment, not a correctness gap for v1: the
 * RPCs themselves are still the authority regardless of what this sheet
 * displays.
 */
export function OpenMatchDetailSheet({
  visible,
  onClose,
  openMatch,
  currentUserId,
}: {
  visible: boolean;
  onClose: () => void;
  openMatch: OpenMatchListing;
  currentUserId: string;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {visible ? <OpenMatchDetailSheetBody onClose={onClose} openMatch={openMatch} currentUserId={currentUserId} /> : null}
    </Modal>
  );
}

function OpenMatchDetailSheetBody({
  onClose,
  openMatch,
  currentUserId,
}: {
  onClose: () => void;
  openMatch: OpenMatchListing;
  currentUserId: string;
}) {
  const theme = useTheme();
  const { show } = useToast();
  // undefined = not fetched yet, null = never requested.
  const [myRequest, setMyRequest] = useState<OpenMatchJoinRequest | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyJoinRequest(openMatch.id, currentUserId)
      .then((result) => {
        if (!cancelled) setMyRequest(result);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [openMatch.id, currentUserId]);

  const request = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await requestToJoinOpenMatch(openMatch.id);
      setMyRequest({
        id: 'pending-local',
        open_match_id: openMatch.id,
        user_id: currentUserId,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
      show('Request sent.', 'success');
    } catch (err) {
      // Stays open — a closed sheet after a failed request would look
      // identical to one that went through.
      show(err instanceof RankedError ? err.message : "That didn't go through. Try again.", 'error');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (busy || !myRequest) return;
    setBusy(true);
    try {
      await withdrawJoinRequest(myRequest.id);
      setMyRequest({ ...myRequest, status: 'withdrawn' });
      show('Request withdrawn.', 'success');
    } catch (err) {
      show(err instanceof RankedError ? err.message : "That didn't go through. Try again.", 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <ThemedText type="heading">Open game</ThemedText>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
            <ThemedText type="smallBold" themeColor="primary">
              Close
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.hostRow}>
            <Avatar profile={openMatch.host} size={56} />
            <View style={styles.hostText}>
              <ThemedText type="subtitle" numberOfLines={1}>
                {openMatch.host?.display_name ?? 'A player'}&apos;s game
              </ThemedText>
              <ThemedText type="small" themeColor="subtle">
                {openMatch.acceptedCount} {openMatch.acceptedCount === 1 ? 'player' : 'players'} in ·{' '}
                {expiresInLabel(openMatch.created_at)}
              </ThemedText>
            </View>
          </View>

          {loadError ? (
            <ThemedText type="small" themeColor="destructive">
              Couldn&apos;t load your request status. Try again.
            </ThemedText>
          ) : myRequest === undefined ? (
            <ThemedText type="small" themeColor="subtle">
              Loading…
            </ThemedText>
          ) : (
            <RequestStatusBody
              myRequest={myRequest}
              openMatch={openMatch}
              busy={busy}
              onRequest={request}
              onWithdraw={withdraw}
            />
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

/** A real switch, not an if/else chain — JoinRequestStatus is server-
 * controlled and this app was already bitten once tonight by an
 * if/else-style status handler with no fallback (c3e772b). Written
 * with a default: from this first commit rather than retrofitted. */
function RequestStatusBody({
  myRequest,
  openMatch,
  busy,
  onRequest,
  onWithdraw,
}: {
  myRequest: OpenMatchJoinRequest | null;
  openMatch: OpenMatchListing;
  busy: boolean;
  onRequest: () => void;
  onWithdraw: () => void;
}) {
  if (myRequest === null) {
    return <Button title="Request to join" onPress={onRequest} disabled={busy} loading={busy} />;
  }

  switch (myRequest.status) {
    case 'withdrawn':
      return <Button title="Request to join" onPress={onRequest} disabled={busy} loading={busy} />;
    case 'pending':
      return (
        <View style={styles.stackSmall}>
          <ThemedText type="small" themeColor="subtle">
            Waiting on the host to respond.
          </ThemedText>
          <Button title="Withdraw request" variant="outline" onPress={onWithdraw} disabled={busy} loading={busy} />
        </View>
      );
    case 'accepted':
      return (
        <ThemedText type="smallBold" themeColor="primary">
          You&apos;re in — this becomes a real match once enough players join.
        </ThemedText>
      );
    case 'kicked':
      return (
        <ThemedText type="small" themeColor="subtle">
          You were removed from this game.
        </ThemedText>
      );
    case 'declined':
      // "This match is full" reads off the PARENT's status, never a
      // per-request reason — see matchStatusLabel's own doc comment.
      return (
        <ThemedText type="small" themeColor="subtle">
          {openMatch.status === 'converted' ? 'This match is full.' : 'The host declined your request.'}
        </ThemedText>
      );
    default:
      // A status this build doesn't recognize — the server can add one
      // at any time. Same shape as c3e772b; degrade to a neutral,
      // non-broken state instead of rendering nothing.
      return (
        <ThemedText type="small" themeColor="subtle">
          Status unavailable — try closing and reopening.
        </ThemedText>
      );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  body: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  hostText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  stackSmall: {
    gap: Spacing.two,
  },
});
