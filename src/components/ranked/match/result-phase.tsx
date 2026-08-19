import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, TextInput, View } from 'react-native';

import { RankBadge } from '@/components/ranked/rank-badge';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  confirmationTally,
  formatRating,
  formatRatingDelta,
  RANKED_DISPUTE_REASONS,
  RankedError,
  respondToResult,
  tierInfo,
  type RankedDisputeReason,
  type RankedMatchDetail,
} from '@/lib/ranked';

export function ResultPhase({ match, currentUserId }: { match: RankedMatchDetail; currentUserId: string }) {
  if (match.status === 'disputed') return <DisputedView match={match} />;
  if (match.status === 'confirmed') return <ConfirmedView match={match} currentUserId={currentUserId} />;
  return <AwaitingConfirmationView match={match} currentUserId={currentUserId} />;
}

function AwaitingConfirmationView({ match, currentUserId }: { match: RankedMatchDetail; currentUserId: string }) {
  const theme = useTheme();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState<RankedDisputeReason | null>(null);
  const [detail, setDetail] = useState('');

  const me = match.players.find((p) => p.user_id === currentUserId);
  const submitter = match.scorekeeper?.display_name ?? 'the scorekeeper';
  const tally = confirmationTally(match.players);

  const respond = async (accept: boolean, reasonText?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await respondToResult(match.id, accept, reasonText);
    } catch (err) {
      show(err instanceof RankedError ? err.message : "That didn't go through. Try again.", 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitDispute = () => {
    if (!reason) return;
    respond(false, reason === 'Other' ? detail.trim() || 'Other' : reason);
  };

  return (
    <View style={styles.stack}>
      <View>
        <ThemedText type="caption" style={[styles.eyebrow, { color: theme.rally }]}>
          RESULT SUBMITTED · {match.players.length} PLAYERS NOTIFIED
        </ThemedText>
        <ThemedText type="heading" style={styles.title}>
          Confirm result
        </ThemedText>
      </View>

      <View style={[styles.card, { borderColor: theme.navy, backgroundColor: theme.card }]}>
        <ThemedText type="caption" themeColor="mutedForeground">
          FINAL SCORE · SUBMITTED BY {submitter.toUpperCase()}
        </ThemedText>
        <View style={styles.scoreLine}>
          <ThemedText type="title" style={styles.scoreNumber}>
            {match.score_a}
          </ThemedText>
          <ThemedText type="title" themeColor="mutedForeground">
            —
          </ThemedText>
          <ThemedText type="title" style={[styles.scoreNumber, { opacity: 0.5 }]}>
            {match.score_b}
          </ThemedText>
        </View>
        <ThemedText type="caption" themeColor="mutedForeground" style={styles.uppercase}>
          Team {match.winning_team?.toUpperCase()} wins · {match.match_type}
        </ThemedText>
      </View>

      <View style={[styles.card, { borderColor: theme.navy, backgroundColor: theme.card }]}>
        <ThemedText type="caption" themeColor="mutedForeground">
          PLAYER CONFIRMATIONS
        </ThemedText>
        {match.players.map((p) => (
          <View key={p.user_id} style={styles.voteRow}>
            <ThemedText type="small">{p.profile?.display_name ?? 'Player'}</ThemedText>
            <ThemedText
              type="caption"
              style={{ color: p.result_response === 'pending' ? theme.mutedForeground : theme.rally, fontWeight: '700' }}>
              {p.result_response.toUpperCase()}
            </ThemedText>
          </View>
        ))}
      </View>

      {!me || me.result_response !== 'pending' ? (
        <ThemedText type="small" themeColor="subtle" style={styles.centerText}>
          {me?.result_response === 'accepted'
            ? `You accepted. ${tally.accepted} of ${tally.total} in.`
            : me?.result_response === 'disputed'
              ? 'You disputed this result.'
              : 'Waiting on your teammates.'}
        </ThemedText>
      ) : disputing ? (
        <View style={styles.stackSmall}>
          <ThemedText type="subtitle">Why are you disputing this result?</ThemedText>
          {RANKED_DISPUTE_REASONS.map((option) => {
            const active = reason === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                onPress={() => setReason(option)}
                style={[
                  styles.reasonRow,
                  { borderColor: theme.navy, backgroundColor: active ? theme.navy : theme.card },
                ]}>
                <ThemedText type="small" style={{ color: active ? theme.navyForeground : theme.foreground }}>
                  {option}
                </ThemedText>
                <Ionicons
                  name={active ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={active ? theme.rally : theme.mutedForeground}
                />
              </Pressable>
            );
          })}
          {reason === 'Other' ? (
            <TextInput
              value={detail}
              onChangeText={setDetail}
              placeholder="What happened?"
              placeholderTextColor={theme.placeholder}
              multiline
              numberOfLines={3}
              accessibilityLabel="What happened?"
              style={[styles.textarea, { borderColor: theme.navy, backgroundColor: theme.card, color: theme.cardForeground }]}
            />
          ) : null}
          <Button title="Submit dispute" onPress={submitDispute} disabled={!reason || busy} />
        </View>
      ) : (
        <View style={styles.stackSmall}>
          <Button title="Accept" onPress={() => respond(true)} disabled={busy} />
          <Button title="Dispute" variant="outline" onPress={() => setDisputing(true)} disabled={busy} />
        </View>
      )}
    </View>
  );
}

function ConfirmedView({ match, currentUserId }: { match: RankedMatchDetail; currentUserId: string }) {
  const theme = useTheme();
  const me = match.players.find((p) => p.user_id === currentUserId);
  const won = match.winning_team === me?.team;
  const myScore = me?.team === 'a' ? match.score_a : match.score_b;
  const theirScore = me?.team === 'a' ? match.score_b : match.score_a;

  // tier_before is null exactly when this was the match that completed
  // calibration — there was no visible ladder position before it, so
  // that's a placement, not a promotion or demotion.
  const justPlaced = me !== undefined && me.tier_before === null && me.tier_after !== null;
  const promoted = me !== undefined && me.tier_before !== null && me.tier_after !== null && me.tier_after > me.tier_before;
  const demoted = me !== undefined && me.tier_before !== null && me.tier_after !== null && me.tier_after < me.tier_before;
  const impactful = promoted || demoted;

  const shareText = me
    ? `I just ${won ? 'won' : 'played'} ${myScore}–${theirScore} on AIR/Rally Ranked${
        me.tier_after ? ` — now ${tierInfo(me.tier_after).name}` : ''
      }.`
    : 'AIR/Rally Ranked match result.';

  const shareResult = () => {
    Share.share({ message: shareText }).catch(() => {
      // Share sheet dismissed or unavailable — not an error.
    });
  };

  return (
    <View style={styles.stack}>
      <View style={[styles.navyCard, { backgroundColor: theme.navy, borderColor: theme.navy }]}>
        <ThemedText type="caption" style={[styles.eyebrow, { color: theme.rally }]}>
          MATCH COMPLETE
        </ThemedText>
        <View style={styles.finalScoreRow}>
          <View style={styles.finalScoreCol}>
            <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.6 }}>
              TEAM A
            </ThemedText>
            <ThemedText
              type="title"
              style={[
                styles.finalScoreNumber,
                { color: theme.navyForeground, opacity: match.winning_team === 'a' ? 1 : 0.5 },
                match.winning_team === 'a' && { color: theme.rally },
              ]}>
              {match.score_a}
            </ThemedText>
          </View>
          <View style={[styles.finalScoreDivider, { backgroundColor: theme.navyForeground }]} />
          <View style={styles.finalScoreCol}>
            <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.6 }}>
              TEAM B
            </ThemedText>
            <ThemedText
              type="title"
              style={[
                styles.finalScoreNumber,
                { color: theme.navyForeground, opacity: match.winning_team === 'b' ? 1 : 0.5 },
                match.winning_team === 'b' && { color: theme.rally },
              ]}>
              {match.score_b}
            </ThemedText>
          </View>
        </View>
        <View style={[styles.winnerRow, styles.navyHairline]}>
          <ThemedText type="caption" style={{ color: theme.navyForeground, opacity: 0.6 }}>
            WINNER
          </ThemedText>
          <ThemedText type="subtitle" style={{ color: theme.rally }}>
            Team {match.winning_team?.toUpperCase()}
          </ThemedText>
        </View>
      </View>

      {me && me.tier_after !== null ? (
        <View
          style={[
            styles.card,
            { borderColor: theme.navy },
            impactful ? { backgroundColor: theme.navy } : { backgroundColor: theme.card },
          ]}>
          <ThemedText type="caption" style={[styles.eyebrow, { color: impactful ? theme.rally : theme.mutedForeground }]}>
            {promoted ? 'RANK UP' : demoted ? 'RANK DOWN' : justPlaced ? 'PLACED' : 'RANK IMPACT'}
          </ThemedText>
          <View style={styles.rankRow}>
            {!justPlaced && me.tier_before !== null ? (
              <>
                <View style={styles.rankItem}>
                  <RankBadge tier={me.tier_before} on={impactful ? 'navy' : 'light'} size={64} />
                  <ThemedText
                    type="caption"
                    style={{ color: impactful ? theme.navyForeground : theme.mutedForeground, opacity: 0.7 }}>
                    {tierInfo(me.tier_before).name}
                  </ThemedText>
                </View>
                <ThemedText type="subtitle" style={{ color: theme.rally }}>
                  →
                </ThemedText>
              </>
            ) : null}
            <View style={styles.rankItem}>
              <RankBadge tier={me.tier_after} on={impactful ? 'navy' : 'light'} size={promoted ? 88 : 64} />
              <ThemedText
                type="caption"
                style={{ color: impactful ? theme.navyForeground : theme.foreground, fontWeight: '700' }}>
                {tierInfo(me.tier_after).name}
              </ThemedText>
            </View>
          </View>

          {me.rating_after !== null ? (
            <View
              style={[
                styles.aarRow,
                { borderTopColor: impactful ? 'rgba(246, 241, 232, 0.25)' : theme.border },
              ]}>
              <ThemedText type="caption" style={{ color: impactful ? theme.navyForeground : theme.mutedForeground, opacity: 0.7 }}>
                AAR
              </ThemedText>
              <View style={styles.aarValues}>
                {me.rating_before !== null ? (
                  <ThemedText type="small" style={{ color: impactful ? theme.navyForeground : theme.mutedForeground, opacity: 0.7 }}>
                    {formatRating(me.rating_before)}
                  </ThemedText>
                ) : null}
                <ThemedText type="smallBold" style={{ color: theme.rally }}>
                  →
                </ThemedText>
                <ThemedText type="subtitle" style={{ color: impactful ? theme.navyForeground : theme.foreground }}>
                  {formatRating(me.rating_after)}
                </ThemedText>
                {me.rating_delta !== null ? (
                  <ThemedText type="smallBold" style={{ color: theme.rally }}>
                    {formatRatingDelta(me.rating_delta)}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <Button title="Share result" variant="outline" onPress={shareResult} icon={<Ionicons name="share-outline" size={18} color={theme.foreground} />} />
    </View>
  );
}

function DisputedView({ match }: { match: RankedMatchDetail }) {
  const theme = useTheme();
  return (
    <View style={[styles.disputedCard, { backgroundColor: theme.rally, borderColor: theme.rally }]}>
      <ThemedText type="title" style={{ color: theme.rallyForeground }}>
        Result disputed
      </ThemedText>
      <ThemedText type="small" style={{ color: theme.rallyForeground, lineHeight: 20 }}>
        Reason: {match.dispute_reason ?? 'Not specified'}. No pips, AAR or win/loss changes are applied until this is
        resolved.
      </ThemedText>
      <View style={[styles.disputedFooter, { borderTopColor: 'rgba(255,255,255,0.35)' }]}>
        <ThemedText type="caption" style={[styles.uppercase, { color: theme.rallyForeground, fontWeight: '700' }]}>
          All four players have been notified. AIR/Rally support will review this match.
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.four,
  },
  stackSmall: {
    gap: Spacing.two + Spacing.half,
  },
  eyebrow: {
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    marginTop: Spacing.one,
  },
  uppercase: {
    letterSpacing: 0.4,
  },
  centerText: {
    textAlign: 'center',
  },
  card: {
    borderWidth: 2,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.three,
  },
  scoreNumber: {
    fontSize: 48,
    lineHeight: 48,
  },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  textarea: {
    borderWidth: 2,
    borderRadius: Radius.md,
    padding: Spacing.three,
    minHeight: 80,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  navyCard: {
    borderWidth: 2,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  finalScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  finalScoreCol: {
    flex: 1,
    gap: Spacing.one,
  },
  finalScoreNumber: {
    fontSize: 44,
    lineHeight: 44,
  },
  finalScoreDivider: {
    width: 2,
    height: 56,
    opacity: 0.25,
  },
  winnerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  // navyForeground is the same '#f6f1e8' in both palettes — safe as a
  // literal low-alpha mix on this fixed-dark navy surface.
  navyHairline: {
    borderTopWidth: 2,
    borderTopColor: 'rgba(246, 241, 232, 0.25)',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  rankItem: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  aarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: Spacing.three,
  },
  aarValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  disputedCard: {
    borderWidth: 2,
    borderRadius: Radius.xl,
    padding: Spacing.five,
    gap: Spacing.three,
  },
  disputedFooter: {
    borderTopWidth: 1,
    paddingTop: Spacing.three,
  },
});
