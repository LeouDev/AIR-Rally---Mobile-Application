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

  // Migration 120: request_to_join_open_match auto-accepts on a passing
  // rank-gap check — there is no host review step and no 'pending' row
  // is ever created. A resolved call means accepted; a rejected call
  // means the check failed and nothing was written at all. Confirmed
  // directly against the deployed function, not inferred from the
  // memo's shorthand.
  const request = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await requestToJoinOpenMatch(openMatch.id);
      setMyRequest({
        id: 'accepted-local',
        open_match_id: openMatch.id,
        user_id: currentUserId,
        status: 'accepted',
        created_at: new Date().toISOString(),
      });
      show("You're in!", 'success');
    } catch (err) {
      // Stays open — a closed sheet after a failed request would look
      // identical to one that went through.
      show(err instanceof RankedError ? err.message : "That didn't go through. Try again.", 'error');
    } finally {
      setBusy(false);
    }
  };

  // withdraw_join_request now only ever operates on an 'accepted' row —
  // "leave a match you already joined," not "cancel a pending ask"
  // (there's nothing pending left to cancel post-120).
  const leave = async () => {
    if (busy || !myRequest) return;
    setBusy(true);
    try {
      await withdrawJoinRequest(myRequest.id);
      setMyRequest({ ...myRequest, status: 'withdrawn' });
      show('You left this game.', 'success');
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
                {expiresInLabel(openMatch.scheduled_at)}
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
            <RequestStatusBody myRequest={myRequest} busy={busy} onRequest={request} onLeave={leave} />
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

/** A real switch, not an if/else chain — JoinRequestStatus is server-
 * controlled and this app was already bitten once tonight by an
 * if/else-style status handler with no fallback (c3e772b). Written
 * with a default: from this first commit rather than retrofitted.
 *
 * No 'pending' case: migration 120 made it unreachable for any row
 * created after it shipped (auto-accept on a passing check, a
 * synchronous rejection on a failing one — nothing is ever left
 * waiting on a host). It falls through to default rather than being
 * deleted from JoinRequestStatus's type, since a pre-120 row could in
 * principle still hold it — default's generic copy is honest either
 * way, unlike leaving the old "waiting on the host" text in place,
 * which would now be actively wrong. */
function RequestStatusBody({
  myRequest,
  busy,
  onRequest,
  onLeave,
}: {
  myRequest: OpenMatchJoinRequest | null;
  busy: boolean;
  onRequest: () => void;
  onLeave: () => void;
}) {
  if (myRequest === null) {
    return <Button title="Request to join" onPress={onRequest} disabled={busy} loading={busy} />;
  }

  switch (myRequest.status) {
    case 'withdrawn':
      return <Button title="Request to join" onPress={onRequest} disabled={busy} loading={busy} />;
    case 'accepted':
      return (
        <View style={styles.stackSmall}>
          <ThemedText type="smallBold" themeColor="primary">
            You&apos;re in.
          </ThemedText>
          <Button title="Leave game" variant="outline" onPress={onLeave} disabled={busy} loading={busy} />
        </View>
      );
    case 'kicked':
      return (
        <ThemedText type="small" themeColor="subtle">
          You were removed from this game.
        </ThemedText>
      );
    case 'declined':
      // Migration 120: the only path here now is cancel_open_match's
      // cascade — every 'accepted' row flips to 'declined' when the
      // host cancels the whole match. It no longer means "the host
      // turned you down" (auto-accept removed that entirely) or "you
      // lost the race for the last slot" (the row lock in
      // request_to_join_open_match means that race can't happen — the
      // loser never gets a row at all). One meaning, one message.
      return (
        <ThemedText type="small" themeColor="subtle">
          This game was cancelled by the host.
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
