import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/post-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  cancelOpenMatch,
  expiresInLabel,
  getMyJoinRequest,
  kickAcceptedPlayer,
  listJoinedPlayers,
  RankedError,
  requestToJoinOpenMatch,
  startOpenMatchFull,
  startOpenMatchSingles,
  withdrawJoinRequest,
  type JoinedPlayer,
  type OpenMatchJoinRequest,
  type OpenMatchListing,
} from '@/lib/open-match';
import { offerPushNotifications } from '@/lib/push';

/**
 * The join flow for a viewer — request, withdraw, and see your own
 * request's status — and, when the viewer is the HOST, the management
 * panel instead (HostControls below). A requester still never sees other
 * requesters' identities: only the host's panel lists who has joined.
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
  // Shown inside the sheet: the app's toasts render in the root view,
  // underneath this page-sheet Modal, so an error toast here was never
  // seen — a rejected join (rank gap, game full) looked like nothing.
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A host has no join request of their own — the server rejects one
  // ("You are already hosting this match") — so they get the host panel.
  const isHost = openMatch.host_id === currentUserId;

  useEffect(() => {
    if (isHost) return;
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
  }, [openMatch.id, currentUserId, isHost]);

  // Migration 120: request_to_join_open_match auto-accepts on a passing
  // rank-gap check — there is no host review step and no 'pending' row
  // is ever created. A resolved call means accepted; a rejected call
  // means the check failed and nothing was written at all. Confirmed
  // directly against the deployed function, not inferred from the
  // memo's shorthand.
  const request = async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      // The real row id, not a placeholder: "Leave game" right after
      // joining withdraws by this id, and a placeholder failed the
      // server's uuid cast on every tap.
      const requestId = await requestToJoinOpenMatch(openMatch.id);
      setMyRequest({
        id: requestId,
        open_match_id: openMatch.id,
        user_id: currentUserId,
        status: 'accepted',
        created_at: new Date().toISOString(),
      });
      show("You're in!", 'success');
      void offerPushNotifications("You're in this game.");
    } catch (err) {
      // Stays open — a closed sheet after a failed request would look
      // identical to one that went through.
      setActionError(err instanceof RankedError ? err.message : "That didn't go through. Try again.");
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
    setActionError(null);
    try {
      await withdrawJoinRequest(myRequest.id);
      setMyRequest({ ...myRequest, status: 'withdrawn' });
      show('You left this game.', 'success');
    } catch (err) {
      setActionError(err instanceof RankedError ? err.message : "That didn't go through. Try again.");
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
            <ThemedText type="smallBold" themeColor="primaryText">
              Close
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.hostRow}>
            <Avatar profile={openMatch.host} size={56} />
            <View style={styles.hostText}>
              <ThemedText type="subtitle" numberOfLines={1}>
                {isHost ? 'Your game' : `${openMatch.host?.display_name ?? 'A player'}'s game`}
              </ThemedText>
              <ThemedText type="small" themeColor="subtle">
                {openMatch.acceptedCount} {openMatch.acceptedCount === 1 ? 'player' : 'players'} in ·{' '}
                {expiresInLabel(openMatch.scheduled_at)}
              </ThemedText>
            </View>
          </View>

          {isHost ? (
            <HostControls openMatch={openMatch} onClose={onClose} />
          ) : loadError ? (
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
          {actionError ? (
            <ThemedText type="small" themeColor="destructive">
              {actionError}
            </ThemedText>
          ) : null}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * The host's side, which had no UI at all: the RPCs existed (kick,
 * cancel, start singles/doubles) with nothing calling them, and tapping
 * your own game opened the joiner's "Request to join" sheet. The case
 * that mattered most: at kickoff the server converts exactly 2 players to
 * singles or exactly 4 to doubles and silently EXPIRES anything else — so
 * a host stuck at 3 needs to see that and be able to remove one.
 */
function HostControls({ openMatch, onClose }: { openMatch: OpenMatchListing; onClose: () => void }) {
  const theme = useTheme();
  // undefined = loading. The host counts toward the total but isn't a row.
  const [players, setPlayers] = useState<JoinedPlayer[] | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listJoinedPlayers(openMatch.id)
      .then((rows) => {
        if (cancelled) return;
        setPlayers(rows);
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [openMatch.id, reloadCount]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof RankedError ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = (player: JoinedPlayer) => {
    const name = player.profile?.display_name ?? 'this player';
    Alert.alert(`Remove ${name}?`, "They'll be taken out of this game.", [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await kickAcceptedPlayer(player.requestId);
            setReloadCount((n) => n + 1);
          }),
      },
    ]);
  };

  const start = (startMatch: (openMatchId: string) => Promise<string>) =>
    run(async () => {
      const matchId = await startMatch(openMatch.id);
      onClose();
      router.push({ pathname: '/ranked/[matchId]', params: { matchId } });
    });

  const cancel = () => {
    Alert.alert('Cancel this game?', 'Everyone who joined is taken out, and the game comes off the list.', [
      { text: 'Keep game', style: 'cancel' },
      {
        text: 'Cancel game',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await cancelOpenMatch(openMatch.id);
            onClose();
          }),
      },
    ]);
  };

  if (loadError) {
    return (
      <View style={styles.stackSmall}>
        <ThemedText type="small" themeColor="destructive">
          Couldn&apos;t load who has joined.
        </ThemedText>
        <Button title="Try again" variant="secondary" onPress={() => setReloadCount((n) => n + 1)} />
      </View>
    );
  }
  if (players === undefined) {
    return (
      <ThemedText type="small" themeColor="subtle">
        Loading players…
      </ThemedText>
    );
  }

  const total = players.length + 1;
  return (
    <View style={styles.stackSmall}>
      <ThemedText type="smallBold">You&apos;re hosting · {total} of 4 in</ThemedText>
      {players.map((player) => (
        <View key={player.requestId} style={[styles.playerRow, { borderBottomColor: theme.hairline }]}>
          <Avatar profile={player.profile} size={32} />
          <ThemedText type="small" style={styles.playerName} numberOfLines={1}>
            {player.profile?.display_name ?? 'A player'}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${player.profile?.display_name ?? 'player'}`}
            onPress={() => remove(player)}
            disabled={busy}
            hitSlop={12}>
            <ThemedText type="smallBold" themeColor="destructive">
              Remove
            </ThemedText>
          </Pressable>
        </View>
      ))}

      {total === 2 ? (
        <>
          <Button title="Start singles now" onPress={() => start(startOpenMatchSingles)} disabled={busy} loading={busy} />
          <ThemedText type="caption" themeColor="mutedForeground">
            Or wait — two more players makes it doubles.
          </ThemedText>
        </>
      ) : total === 4 ? (
        <Button title="Start doubles now" onPress={() => start(startOpenMatchFull)} disabled={busy} loading={busy} />
      ) : total === 3 ? (
        <ThemedText type="small" themeColor="subtle">
          Three players can&apos;t start: one more makes doubles, or remove a player to start singles. If it&apos;s
          still three at kickoff, the game expires.
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="subtle">
          No one has joined yet. If nobody joins before kickoff, the game expires.
        </ThemedText>
      )}

      {actionError ? (
        <ThemedText type="small" themeColor="destructive">
          {actionError}
        </ThemedText>
      ) : null}
      <Button title="Cancel game" variant="ghost" onPress={cancel} disabled={busy} />
    </View>
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
          <ThemedText type="smallBold" themeColor="primaryText">
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
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    borderBottomWidth: 1,
  },
  playerName: {
    flex: 1,
    minWidth: 0,
  },
});
