import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { RankBadge } from '@/components/ranked/rank-badge';
import { monoFont, ShareCardFrame } from '@/components/share-card-frame';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  confirmationTally,
  formatRating,
  formatRatingDelta,
  myMatchResult,
  opponentNames,
  RANKED_DISPUTE_REASONS,
  rankLabel,
  RankedError,
  respondToResult,
  tierInfo,
  type RankedDisputeReason,
  type RankedMatchDetail,
} from '@/lib/ranked';
import { shareCard } from '@/lib/share';

/** The image attached when a confirmed result is shared externally (see
 * ConfirmedView's shareResult) — rendered off-screen and captured with
 * react-native-view-shot, same technique and shell (ShareCardFrame) as
 * COURT/Side's post share cards. */
function RankedResultShareCard({
  match,
  currentUserId,
  viewRef,
}: {
  match: RankedMatchDetail;
  currentUserId: string;
  viewRef: React.RefObject<View | null>;
}) {
  const result = myMatchResult(match, match.players, currentUserId);
  const authorName = result?.me.profile?.display_name ?? 'A player';
  const initial = authorName.trim()[0]?.toUpperCase() ?? '?';
  const opponents = result ? opponentNames(match.players, result.me) : '';

  return (
    <ShareCardFrame
      viewRef={viewRef}
      tag="RANKED"
      authorInitial={initial}
      authorName={authorName}
      authorSub={opponents ? `${result?.won ? 'defeated' : 'played'} ${opponents}` : 'played a ranked match'}>
      <View style={shareCardStyles.resultGroup}>
        <View style={shareCardStyles.resultRow}>
          <Text style={[shareCardStyles.resultWord, result && !result.won && shareCardStyles.resultWordLoss]}>
            {result?.won ? 'WON' : 'LOST'}
          </Text>
          <Text style={shareCardStyles.resultScore}>
            {result?.myScore}–{result?.theirScore}
          </Text>
        </View>
        <Text style={shareCardStyles.matchType}>Ranked · {match.match_type === 'singles' ? 'Singles' : 'Doubles'}</Text>
      </View>

      {result && result.me.tier_after !== null && result.me.pips_after !== null ? (
        <View style={shareCardStyles.rankedPanel}>
          <View style={shareCardStyles.rankRow}>
            <Text style={shareCardStyles.rankRowLabel}>TIER</Text>
            <View style={shareCardStyles.tierShift}>
              {!result.justPlaced && result.me.tier_before !== null && result.me.pips_before !== null ? (
                <>
                  <View style={shareCardStyles.tierBadge}>
                    <Text style={shareCardStyles.tierBadgeText}>{rankLabel(result.me.tier_before, result.me.pips_before)}</Text>
                  </View>
                  <Text style={shareCardStyles.tierArrow}>→</Text>
                </>
              ) : null}
              <View style={[shareCardStyles.tierBadge, shareCardStyles.tierBadgeAfter]}>
                <Text style={[shareCardStyles.tierBadgeText, shareCardStyles.tierBadgeTextAfter]}>
                  {rankLabel(result.me.tier_after, result.me.pips_after)}
                </Text>
              </View>
            </View>
          </View>

          {result.me.rating_after !== null ? (
            <>
              <View style={shareCardStyles.rankedDivider} />
              <View style={shareCardStyles.rankRow}>
                <Text style={shareCardStyles.rankRowLabel}>Rating (AAR)</Text>
                <Text style={shareCardStyles.ratingShift}>
                  {result.me.rating_before !== null ? `${formatRating(result.me.rating_before)} → ` : ''}
                  {formatRating(result.me.rating_after)}
                  {result.me.rating_delta !== null ? (
                    <Text style={shareCardStyles.ratingDelta}> {formatRatingDelta(result.me.rating_delta)}</Text>
                  ) : null}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </ShareCardFrame>
  );
}

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
  const shareCardRef = useRef<View>(null);
  const result = myMatchResult(match, match.players, currentUserId);
  const me = result?.me;
  const won = result?.won ?? false;
  const myScore = result?.myScore;
  const theirScore = result?.theirScore;
  const justPlaced = result?.justPlaced ?? false;
  const promoted = result?.promoted ?? false;
  const demoted = result?.demoted ?? false;
  const impactful = promoted || demoted;

  const shareText = me
    ? `I just ${won ? 'won' : 'played'} ${myScore}–${theirScore} on AIR/Rally Ranked${
        me.tier_after ? ` — now ${tierInfo(me.tier_after).name}` : ''
      }.`
    : 'AIR/Rally Ranked match result.';

  const shareResult = async () => {
    // No `url` passed, deliberately: the web's /ranked/match/{id} sits
    // behind requireSignedIn(), so a recipient tapping a link to it
    // lands on a login wall rather than the result — worse than sending
    // no link at all. When a publicly-viewable confirmed-match page
    // exists, pass its URL here; shareCard() carries it from there.
    try {
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 1, width: 1080, height: 1920 });
      await shareCard({ fileUri: uri, message: shareText });
      return;
    } catch {
      // Capture failed — fall through to the text alone rather than
      // doing nothing. shareCard() swallows its own sheet failures, so
      // reaching here means there was no image to attach.
    }
    try {
      await Share.share({ message: shareText });
    } catch {
      // Share sheet dismissed or unavailable — not an error.
    }
  };

  return (
    <View style={styles.stack}>
      <View style={styles.shareCardOffscreen} pointerEvents="none">
        <RankedResultShareCard match={match} currentUserId={currentUserId} viewRef={shareCardRef} />
      </View>
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
  shareCardOffscreen: {
    position: 'absolute',
    top: 0,
    left: -2000,
  },
});

// Fixed brand palette, not theme tokens — see RankedResultShareCard's own
// comment and ShareCardFrame.
const shareCardStyles = StyleSheet.create({
  resultGroup: {
    gap: 2,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  resultWord: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: '#45c47f',
  },
  resultWordLoss: {
    color: '#f3ead9',
  },
  resultScore: {
    fontFamily: monoFont,
    fontSize: 20,
    fontWeight: '700',
    color: '#f3ead9',
  },
  matchType: {
    fontSize: 11,
    color: '#93a2b8',
  },
  rankedPanel: {
    backgroundColor: '#f6f1e8',
    borderLeftWidth: 4,
    borderLeftColor: '#f3700f',
    padding: 16,
    gap: 12,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rankRowLabel: {
    fontFamily: monoFont,
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: '700',
    color: '#5a6675',
    textTransform: 'uppercase',
  },
  tierShift: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  tierBadge: {
    borderWidth: 1,
    borderColor: 'rgba(15,39,71,0.18)',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  tierBadgeAfter: {
    backgroundColor: '#0f2747',
    borderColor: '#0f2747',
  },
  tierBadgeText: {
    fontFamily: monoFont,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0f2747',
  },
  tierBadgeTextAfter: {
    color: '#f3ead9',
  },
  tierArrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f3700f',
  },
  rankedDivider: {
    height: 1,
    backgroundColor: 'rgba(15,39,71,0.12)',
  },
  ratingShift: {
    fontFamily: monoFont,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f2747',
  },
  ratingDelta: {
    color: '#1f9d55',
  },
});
