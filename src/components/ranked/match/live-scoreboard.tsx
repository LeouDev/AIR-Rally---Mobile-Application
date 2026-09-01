import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  calledServerScore,
  cancelMatch,
  disambiguatedFirstName,
  isFinishedGame,
  recordPoint,
  RankedError,
  submitResult,
  teamIdentityLabel,
  undoPoint,
  type RankedMatchDetail,
} from '@/lib/ranked';

/**
 * The live phase. Direct RPC calls on tap, no confirmation dialog — a
 * scorekeeper standing courtside taps this dozens of times a game, and
 * every other player's screen catches up over Realtime (useRankedMatch)
 * in close to real time. Ported from the web's LiveScoreboard.tsx, minus
 * the CourtDiagram (this app has no SVG-rendering library) — the serving
 * side is still called out in the score row and the status line below.
 */
type ScoreAction = 'pointA' | 'pointB' | 'undo' | 'submit' | 'cancel';

export function LiveScoreboard({ match, currentUserId }: { match: RankedMatchDetail; currentUserId: string }) {
  const theme = useTheme();
  // One RPC in flight at a time, still — a scorekeeper double-tapping
  // must never record two points or race two writes against the same
  // match row, so `disabled` below stays keyed on `busy` for all four
  // buttons. What changes is the FEEDBACK: `pending` names which single
  // action actually triggered it, so only that one button shows the
  // loading state instead of all four flashing together. Reported by the
  // founder on the app's first live-scored match — every button dimmed
  // on any tap, with no way to tell which one had registered.
  const [pending, setPending] = useState<ScoreAction | null>(null);
  const busy = pending !== null;
  const [error, setError] = useState<string | null>(null);

  const isScorekeeper = match.scorekeeper_id === currentUserId;
  const me = match.players.find((p) => p.user_id === currentUserId);
  const teamA = match.players.filter((p) => p.team === 'a');
  const teamB = match.players.filter((p) => p.team === 'b');
  const finished = isFinishedGame(match);

  const run = (key: ScoreAction, action: () => Promise<void>) => {
    if (busy) return;
    setError(null);
    setPending(key);
    action()
      .catch((err) => {
        setError(err instanceof RankedError ? err.message : "That didn't go through. Try again.");
      })
      .finally(() => setPending(null));
  };

  // cancel_ranked_match() has always permitted cancelling from 'lobby',
  // 'officiating', or 'live', by any participant — this app just never
  // offered the affordance on the live scoreboard (48add7e added it to
  // officiating only, deliberately leaving live for a later call since
  // walking out of a match already being scored is a different act from
  // cancelling one that never started). QA found a real production
  // match stuck live with real rally data for 46+ hours — migration 114
  // deliberately exempts a live match with recorded rallies from its
  // stale-lobby sweep, so nothing else ever recovers it. Confirmed
  // first, unlike the point/undo/submit actions above: unlike those,
  // this one ends the match for everyone, and by 'live' every player
  // has already readied up and started scoring.
  const confirmCancel = () => {
    Alert.alert(
      'Cancel this match?',
      'This match is already being scored. Cancelling ends it for everyone — nothing is recorded against anyone’s rank, and this can’t be undone.',
      [
        { text: 'Keep match', style: 'cancel' },
        { text: 'Cancel match', style: 'destructive', onPress: () => run('cancel', () => cancelMatch(match.id)) },
      ]
    );
  };

  const firstNames = (team: typeof teamA) => team.map((p) => disambiguatedFirstName(p, match.players)).join(' · ');
  // Doubles shows the team's chosen identity; singles shows the player's
  // name — the founder's own rule, keyed on match type inside
  // teamIdentityLabel() itself, not duplicated here.
  const teamLabel = (team: typeof teamA, club: typeof match.team_a_club, name: string | null) =>
    teamIdentityLabel({ matchType: match.match_type, teamName: name, club, playerNames: firstNames(team) }).label;

  return (
    <View style={[styles.container, { backgroundColor: theme.navy, borderColor: theme.navy }]}>
      <View style={[styles.header, styles.hairline]}>
        <ThemedText type="caption" style={[styles.eyebrow, { color: theme.rally }]}>
          {isScorekeeper ? "YOU'RE KEEPING SCORE" : `SCOREKEEPER: ${match.scorekeeper?.display_name ?? '—'}`.toUpperCase()}
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.6 }}>
          {finished ? 'GAME POINT REACHED' : 'IN PROGRESS'}
        </ThemedText>
      </View>

      <View style={[styles.scoreRow, styles.hairline]}>
        <View style={[styles.scoreCol, styles.scoreColBorder]}>
          <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.65 }}>
            TEAM A
          </ThemedText>
          <ThemedText type="title" style={[styles.scoreNumber, { color: match.serving_team === 'a' ? theme.rally : theme.navyForeground }]}>
            {match.score_a}
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.6 }}>
            {teamLabel(teamA, match.team_a_club, match.team_a_name)}
          </ThemedText>
        </View>
        <View style={styles.scoreCol}>
          <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.65 }}>
            TEAM B
          </ThemedText>
          <ThemedText type="title" style={[styles.scoreNumber, { color: match.serving_team === 'b' ? theme.rally : theme.navyForeground }]}>
            {match.score_b}
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.6 }}>
            {teamLabel(teamB, match.team_b_club, match.team_b_name)}
          </ThemedText>
        </View>
      </View>

      <View style={styles.courtRow}>
        <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.65 }}>
          LIVE COURT
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.rally, fontWeight: '700' }}>
          SERVING: TEAM {match.serving_team.toUpperCase()}
          {match.match_type === 'doubles' && match.scoring_mode === 'side_out' ? ` · ${calledServerScore(match)}` : ''}
        </ThemedText>
      </View>

      {error ? (
        <ThemedText type="caption" style={[styles.error, { color: theme.rally }]}>
          {error}
        </ThemedText>
      ) : null}

      {isScorekeeper ? (
        <View style={styles.actions}>
          <Button
            title="Team A won the rally"
            onPress={() => run('pointA', () => recordPoint(match.id, 'a'))}
            disabled={busy}
            disabledAppearance={false}
            loading={pending === 'pointA'}
          />
          <Button
            title="Team B won the rally"
            variant="outline"
            onPress={() => run('pointB', () => recordPoint(match.id, 'b'))}
            disabled={busy}
            disabledAppearance={false}
            loading={pending === 'pointB'}
          />
          <View style={styles.actionRow}>
            <View style={styles.actionHalf}>
              <Button
                title="Undo"
                variant="outline"
                onPress={() => run('undo', () => undoPoint(match.id))}
                disabled={busy || (match.score_a === 0 && match.score_b === 0)}
                disabledAppearance={match.score_a === 0 && match.score_b === 0}
                loading={pending === 'undo'}
              />
            </View>
            <View style={styles.actionHalf}>
              <Button
                title="Submit final"
                variant="outline"
                onPress={() => run('submit', () => submitResult(match.id))}
                disabled={busy || !finished}
                disabledAppearance={!finished}
                loading={pending === 'submit'}
              />
            </View>
          </View>
        </View>
      ) : (
        <ThemedText type="small" style={[styles.watching, { color: theme.navyForeground, opacity: 0.75 }]}>
          Watching live — only {match.scorekeeper?.display_name ?? 'the scorekeeper'} can record points.
        </ThemedText>
      )}

      {me ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel match"
          onPress={confirmCancel}
          disabled={busy}
          hitSlop={8}
          style={styles.cancelLink}>
          <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.6 }}>
            Cancel match
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  // navyForeground is the same '#f6f1e8' in both palettes — this whole
  // surface is the fixed-dark navy card, so a literal low-alpha mix is
  // safe (RN borders have no separate opacity channel).
  hairline: {
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(246, 241, 232, 0.25)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  eyebrow: {
    fontWeight: '700',
    letterSpacing: 1,
    flexShrink: 1,
  },
  scoreRow: {
    flexDirection: 'row',
  },
  scoreCol: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.one,
  },
  scoreColBorder: {
    borderRightWidth: 2,
    borderRightColor: 'rgba(246, 241, 232, 0.25)',
  },
  scoreNumber: {
    fontSize: 56,
    lineHeight: 56,
  },
  courtRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  error: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    fontWeight: '600',
  },
  actions: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.two + Spacing.half,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two + Spacing.half,
  },
  actionHalf: {
    flex: 1,
  },
  watching: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  cancelLink: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
});
