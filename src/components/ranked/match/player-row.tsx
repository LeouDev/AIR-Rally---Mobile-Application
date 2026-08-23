import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/post-card';
import { PipRow } from '@/components/ranked/pip-row';
import { RankBadge } from '@/components/ranked/rank-badge';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { RankedMatchParticipant } from '@/lib/ranked';

/**
 * One player in a team roster, on the navy lobby surface. `trailing` is
 * whatever the calling phase wants on the right — a ready state today,
 * a vote or confirmation status elsewhere in the room — so this stays
 * one component rather than forking per phase. Ported from the web's
 * PlayerRow.tsx; `trailingColor` takes a resolved color value (this app
 * has no Tailwind class to hand off) and defaults to Rally Orange, which
 * is identical in both palettes (`theme.rally`, '#f3700f').
 */
export function PlayerRow({
  player,
  isYou,
  trailing,
  trailingColor = '#f3700f',
  showDivider = true,
}: {
  player: RankedMatchParticipant;
  isYou: boolean;
  trailing: string;
  trailingColor?: string;
  /** False on the last row in a roster, to match the web's `last:border-b-0`. */
  showDivider?: boolean;
}) {
  const theme = useTheme();
  const name = player.profile?.display_name ?? 'Player';
  // A PlayerRank row exists at its meaningless Dinker-star-1 default the
  // instant someone opens Ranked — see ensure_player_rank(). Only
  // is_calibrated means "this tier is real"; showing the badge before
  // that would tell this player's teammates a fake rank.
  const placed = player.rank?.is_calibrated ?? false;

  return (
    <View style={[styles.row, showDivider && styles.divider]}>
      <Avatar profile={player.profile} size={40} on="navy" />
      {placed ? <RankBadge tier={player.rank!.tier} on="navy" size={40} /> : null}
      <View style={styles.info}>
        <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.navyForeground }}>
          {name}
          {isYou ? ' (you)' : ''}
        </ThemedText>
        {player.rank ? (
          placed ? (
            <PipRow pips={player.rank.pips} on="navy" size="sm" />
          ) : (
            <ThemedText type="caption" style={[styles.unplaced, { color: theme.navyForeground }]}>
              UNPLACED
            </ThemedText>
          )
        ) : null}
      </View>
      <ThemedText type="caption" style={[styles.trailing, { color: trailingColor }]}>
        {trailing}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.half,
    paddingVertical: Spacing.two,
  },
  // navyForeground is the same '#f6f1e8' in both palettes (this row only
  // ever sits on the fixed-dark navy surface), so a literal low-alpha
  // mix is safe here — RN borders have no separate opacity channel.
  divider: {
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(246, 241, 232, 0.15)',
  },
  info: {
    flex: 1,
    gap: Spacing.half,
    minWidth: 0,
  },
  unplaced: {
    letterSpacing: 0.6,
    opacity: 0.6,
  },
  trailing: {
    flexShrink: 0,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
