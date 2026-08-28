import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isFinishedGame, recordPoint, RankedError, submitResult, undoPoint, type RankedMatchDetail } from '@/lib/ranked';

/**
 * The live phase. Direct RPC calls on tap, no confirmation dialog — a
 * scorekeeper standing courtside taps this dozens of times a game, and
 * every other player's screen catches up over Realtime (useRankedMatch)
 * in close to real time. Ported from the web's LiveScoreboard.tsx, minus
 * the CourtDiagram (this app has no SVG-rendering library) — the serving
 * side is still called out in the score row and the status line below.
 */
export function LiveScoreboard({ match, currentUserId }: { match: RankedMatchDetail; currentUserId: string }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isScorekeeper = match.scorekeeper_id === currentUserId;
  const teamA = match.players.filter((p) => p.team === 'a');
  const teamB = match.players.filter((p) => p.team === 'b');
  const finished = isFinishedGame(match);

  const run = (action: () => Promise<void>) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    action()
      .catch((err) => {
        setError(err instanceof RankedError ? err.message : "That didn't go through. Try again.");
      })
      .finally(() => setBusy(false));
  };

  const teamNames = (team: typeof teamA) => team.map((p) => p.profile?.display_name?.split(' ')[0] ?? '—').join(' · ');

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
            {teamNames(teamA)}
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
            {teamNames(teamB)}
          </ThemedText>
        </View>
      </View>

      <View style={styles.courtRow}>
        <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.65 }}>
          LIVE COURT
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.rally, fontWeight: '700' }}>
          SERVING: TEAM {match.serving_team.toUpperCase()}
        </ThemedText>
      </View>

      {error ? (
        <ThemedText type="caption" style={[styles.error, { color: theme.rally }]}>
          {error}
        </ThemedText>
      ) : null}

      {isScorekeeper ? (
        <View style={styles.actions}>
          <Button title="Team A won the rally" onPress={() => run(() => recordPoint(match.id, 'a'))} disabled={busy} />
          <Button title="Team B won the rally" variant="outline" onPress={() => run(() => recordPoint(match.id, 'b'))} disabled={busy} />
          <View style={styles.actionRow}>
            <View style={styles.actionHalf}>
              <Button
                title="Undo"
                variant="outline"
                onPress={() => run(() => undoPoint(match.id))}
                disabled={busy || (match.score_a === 0 && match.score_b === 0)}
              />
            </View>
            <View style={styles.actionHalf}>
              <Button
                title="Submit final"
                variant="outline"
                onPress={() => run(() => submitResult(match.id))}
                disabled={busy || !finished}
              />
            </View>
          </View>
        </View>
      ) : (
        <ThemedText type="small" style={[styles.watching, { color: theme.navyForeground, opacity: 0.75 }]}>
          Watching live — only {match.scorekeeper?.display_name ?? 'the scorekeeper'} can record points.
        </ThemedText>
      )}
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
});
