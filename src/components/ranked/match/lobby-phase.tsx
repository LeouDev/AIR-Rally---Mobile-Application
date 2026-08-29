import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PlayerRow } from '@/components/ranked/match/player-row';
import { TeamIdentitySheet } from '@/components/ranked/team-identity-sheet';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { RankedTeam } from '@/lib/database.types';
import {
  cancelMatch,
  isMatchBooked,
  matchBalance,
  rankedStakes,
  RankedError,
  RATING_STARTING_VALUE,
  readyTally,
  setReady,
  teamIdentityLabel,
  type RankedMatchDetail,
} from '@/lib/ranked';

const BALANCE_BAR_COUNT = 5;
// navyForeground is the same '#f6f1e8' in both palettes, so a literal
// dimmed mix is safe here — mirrors the web's text-navy-foreground/45.
const WAITING_COLOR = 'rgba(246, 241, 232, 0.45)';

export function LobbyPhase({ match, currentUserId }: { match: RankedMatchDetail; currentUserId: string }) {
  const theme = useTheme();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  // undefined while loading — rankedStakes() treats that as "don't know
  // yet" rather than guessing. Re-fetched per match id: someone who
  // joined via a link and never saw the doorway screen needs to see
  // this too, not just whoever created the match.
  const [booked, setBooked] = useState<boolean | undefined>(undefined);
  const [editingTeam, setEditingTeam] = useState<RankedTeam | null>(null);

  useEffect(() => {
    let cancelled = false;
    isMatchBooked(match.id)
      .then((result) => {
        if (!cancelled) setBooked(result);
      })
      .catch(() => {
        // Leave it undefined — rankedStakes() reads that as "don't
        // know yet" and stays silent on the one thing it can't confirm
        // (the unbooked-and-calibrated warning) rather than guessing.
      });
    return () => {
      cancelled = true;
    };
  }, [match.id]);

  const me = match.players.find((p) => p.user_id === currentUserId);
  const teamA = match.players.filter((p) => p.team === 'a');
  const teamB = match.players.filter((p) => p.team === 'b');
  const tally = readyTally(match.players);
  const balance = matchBalance(
    teamA.map((p) => p.rank?.rating ?? RATING_STARTING_VALUE),
    teamB.map((p) => p.rank?.rating ?? RATING_STARTING_VALUE)
  );
  const stakes = rankedStakes({ rated: match.rated, booked, isCalibrated: me?.rank?.is_calibrated ?? false });

  // The identity-setting affordance is doubles-only and lobby-only (086's
  // own constraints, enforced server-side — this just doesn't offer it
  // outside that window), and only to a player actually on that team.
  const canEditTeams = match.match_type === 'doubles' && match.status === 'lobby' && me !== undefined;
  const firstNames = (team: typeof teamA) => team.map((p) => p.profile?.display_name?.split(' ')[0] ?? '—').join(' · ');
  const teamALabel = teamIdentityLabel({
    matchType: match.match_type,
    teamName: match.team_a_name,
    club: match.team_a_club,
    playerNames: firstNames(teamA),
  });
  const teamBLabel = teamIdentityLabel({
    matchType: match.match_type,
    teamName: match.team_b_name,
    club: match.team_b_club,
    playerNames: firstNames(teamB),
  });
  const editingIdentity =
    editingTeam === 'a'
      ? { name: match.team_a_name, club: match.team_a_club }
      : editingTeam === 'b'
        ? { name: match.team_b_name, club: match.team_b_club }
        : null;

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (err) {
      show(err instanceof RankedError ? err.message : "That didn't go through. Try again.", 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleReady = () => {
    if (!me) return;
    run(() => setReady(match.id, !me.ready));
  };

  const cancel = () => run(() => cancelMatch(match.id));

  return (
    <View style={[styles.container, { backgroundColor: theme.navy, borderColor: theme.navy }]}>
      <View style={[styles.header, styles.hairline]}>
        <ThemedText type="caption" style={[styles.eyebrow, { color: theme.rally }]}>
          MATCH FOUND
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.6 }}>
          {match.match_type.toUpperCase()} · TO {match.target_score}
        </ThemedText>
      </View>

      {/* Whoever is looking at this — not only whoever tapped "start" —
          sees what THIS match means for THEIR OWN rating before it's
          played. The half-rate discount (20260810000112) is decided per
          participant, so a teammate's own copy can legitimately read
          differently from theirs on the same match. */}
      <View style={[styles.stakesRow, styles.hairline]}>
        <ThemedText type="caption" style={[styles.stakesHeadline, { color: theme.rally }]}>
          {stakes.headline.toUpperCase()}
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.75 }}>
          {stakes.detail}
        </ThemedText>
      </View>

      <View style={styles.body}>
        <View style={styles.sectionLabelRow}>
          <ThemedText type="caption" style={[styles.sectionLabel, { color: theme.navyForeground }]}>
            TEAM A{match.match_type === 'doubles' && teamALabel.kind !== 'players' ? ` · ${teamALabel.label}` : ''}
          </ThemedText>
          {canEditTeams && me?.team === 'a' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Edit Team A identity" onPress={() => setEditingTeam('a')} hitSlop={8}>
              <ThemedText type="caption" style={{ color: theme.rally }}>
                {teamALabel.kind === 'players' ? 'Name your team' : 'Edit'}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
        {teamA.map((p, i) => (
          <PlayerRow
            key={p.user_id}
            player={p}
            isYou={p.user_id === currentUserId}
            trailing={p.ready ? 'READY' : 'WAITING'}
            trailingColor={p.ready ? theme.rally : WAITING_COLOR}
            showDivider={i < teamA.length - 1}
          />
        ))}

        <View style={styles.vsRow}>
          <View style={[styles.vsLine, { backgroundColor: theme.navyForeground, opacity: 0.25 }]} />
          <ThemedText type="subtitle" style={{ color: theme.rally }}>
            VS
          </ThemedText>
          <View style={[styles.vsLine, { backgroundColor: theme.navyForeground, opacity: 0.25 }]} />
        </View>

        <View style={styles.sectionLabelRow}>
          <ThemedText type="caption" style={[styles.sectionLabel, { color: theme.navyForeground }]}>
            TEAM B{match.match_type === 'doubles' && teamBLabel.kind !== 'players' ? ` · ${teamBLabel.label}` : ''}
          </ThemedText>
          {canEditTeams && me?.team === 'b' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Edit Team B identity" onPress={() => setEditingTeam('b')} hitSlop={8}>
              <ThemedText type="caption" style={{ color: theme.rally }}>
                {teamBLabel.kind === 'players' ? 'Name your team' : 'Edit'}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
        {teamB.map((p, i) => (
          <PlayerRow
            key={p.user_id}
            player={p}
            isYou={p.user_id === currentUserId}
            trailing={p.ready ? 'READY' : 'WAITING'}
            trailingColor={p.ready ? theme.rally : WAITING_COLOR}
            showDivider={i < teamB.length - 1}
          />
        ))}
      </View>

      <View style={[styles.balanceCard, { borderColor: theme.rally }]}>
        <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.7 }}>
          MATCH BALANCE
        </ThemedText>
        <View style={styles.balanceRight}>
          <View style={styles.balanceBars}>
            {Array.from({ length: BALANCE_BAR_COUNT }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.balanceBar,
                  { backgroundColor: i < balance.bars ? theme.rally : theme.navyForeground },
                  i >= balance.bars && styles.balanceBarEmpty,
                ]}
              />
            ))}
          </View>
          <ThemedText type="smallBold" style={{ color: theme.navyForeground }}>
            {balance.label.toUpperCase()}
          </ThemedText>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={toggleReady}
          disabled={busy || !me}
          style={({ pressed }) => [
            styles.readyButton,
            { borderColor: theme.rally, backgroundColor: me?.ready ? theme.rally : 'transparent' },
            (busy || !me) && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <ThemedText type="subtitle" style={{ color: me?.ready ? theme.rallyForeground : theme.navyForeground }}>
            {me?.ready ? "You're ready" : 'Ready'}
          </ThemedText>
        </Pressable>

        <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.6 }}>
          {tally.ready} / {tally.total} PLAYERS READY
          {!tally.allReady && !me?.ready ? ' — WAITING ON YOU' : ''}
        </ThemedText>

        <Pressable accessibilityRole="button" onPress={cancel} disabled={busy} hitSlop={8} style={styles.cancelLink}>
          <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.6 }}>
            Cancel match
          </ThemedText>
        </Pressable>
      </View>

      <TeamIdentitySheet
        visible={editingTeam !== null}
        onClose={() => setEditingTeam(null)}
        matchId={match.id}
        team={editingTeam ?? 'a'}
        userId={currentUserId}
        currentName={editingIdentity?.name ?? null}
        currentClub={editingIdentity?.club ?? null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  // navyForeground is the same '#f6f1e8' in both palettes — this whole
  // surface is the fixed-dark navy card, so a literal low-alpha mix is
  // safe (RN borders have no separate opacity channel).
  hairline: {
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(246, 241, 232, 0.25)',
  },
  eyebrow: {
    fontWeight: '700',
    letterSpacing: 1,
  },
  body: {
    paddingHorizontal: Spacing.four,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
    opacity: 0.6,
    fontWeight: '700',
    letterSpacing: 1,
    flexShrink: 1,
  },
  stakesRow: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + Spacing.half,
    gap: 2,
  },
  stakesHeadline: {
    fontWeight: '700',
    letterSpacing: 1,
  },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  vsLine: {
    flex: 1,
    height: 2,
  },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: Spacing.four,
    borderWidth: 2,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  balanceRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  balanceBars: {
    flexDirection: 'row',
    gap: 3,
  },
  balanceBar: {
    width: 6,
    height: 16,
  },
  balanceBarEmpty: {
    opacity: 0.25,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.two + Spacing.half,
  },
  readyButton: {
    borderWidth: 2,
    borderRadius: Radius.md,
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.85,
  },
  cancelLink: {
    alignSelf: 'flex-start',
    paddingTop: Spacing.one,
  },
});
