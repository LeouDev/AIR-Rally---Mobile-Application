import { RankBadge } from '@/components/ranked/rank-badge';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PlayerRank } from '@/lib/database.types';
import { calibrationState, formatRating, rankLabel } from '@/lib/ranked';
import { StyleSheet, View } from 'react-native';

/**
 * "Where is this player in Ranked" — the one place that fact gets
 * rendered, reused by RankCard (Profile tab) and the Play doorway so a
 * player's own numbers can't drift into disagreement between two
 * screens claiming to show the same thing two different ways.
 *
 * Two states only, matched to PlayerRank's own two states: calibrating
 * (progress track — no tier or rating shown, that's the whole point of
 * calibration) and calibrated (tier + ARR, using formatRating() so the
 * thousands separator matches the leaderboard). `rank === null` (never
 * played Ranked at all) renders as the calibrating state at 0 of 10 —
 * the same starting point every player has, not an error.
 *
 * Content only — no card wrapper, no background, no CTA. Each caller's
 * surface differs (RankCard's calibrating state is a fixed-navy card,
 * Play's is the screen's regular themed surface), so `surface` picks
 * which text/track colors read correctly rather than this component
 * assuming one.
 */
export function CalibrationStatus({ rank, surface = 'default' }: { rank: PlayerRank | null; surface?: 'default' | 'navy' }) {
  const theme = useTheme();
  const onNavy = surface === 'navy';
  const textColor = onNavy ? theme.navyForeground : undefined;
  const mutedColor = onNavy ? `${theme.navyForeground}CC` : theme.mutedForeground;

  if (!rank?.is_calibrated) {
    const calibration = calibrationState(rank ?? { is_calibrated: false, calibration_matches: 0 });
    return (
      <View style={styles.stack}>
        <ThemedText type="caption" style={[styles.eyebrow, { color: theme.primary }]}>
          Calibrating
        </ThemedText>
        <ThemedText type="subtitle" style={textColor ? { color: textColor } : undefined}>
          {calibration.played} of {calibration.total} calibration matches played
        </ThemedText>
        <View style={styles.track}>
          {Array.from({ length: calibration.total }, (_, i) => (
            <View
              key={i}
              style={[
                styles.segment,
                { backgroundColor: i < calibration.played ? theme.primary : onNavy ? `${theme.navyForeground}33` : theme.border },
              ]}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <RankBadge tier={rank.tier} size={40} on={onNavy ? 'navy' : 'light'} />
      <View style={styles.text}>
        <ThemedText type="caption" style={{ color: mutedColor }}>
          AIR/Rally Rank
        </ThemedText>
        <ThemedText type="subtitle" style={textColor ? { color: textColor } : undefined}>
          {rankLabel(rank.tier, rank.pips)}
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.primary }}>
          ARR {formatRating(rank.rating)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.two,
  },
  track: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
  },
  segment: {
    flex: 1,
    borderRadius: 2,
  },
  eyebrow: {
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
