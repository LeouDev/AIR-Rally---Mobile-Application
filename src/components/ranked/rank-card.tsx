import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RankBadge } from '@/components/ranked/rank-badge';
import { ThemedText } from '@/components/themed-text';
import { Skeleton } from '@/components/ui/skeleton';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PlayerRank } from '@/lib/database.types';
import { calibrationState, getPlayerRank, rankLabel } from '@/lib/ranked';
import { useSession } from '@/providers/session';

/**
 * "My Rank" — Profile-tab card for AIR/Rally Ranked, styled to match
 * OwnerApplicationCTA and ReferralCard in this same screen (icon-in-circle
 * + title + subtitle + a bordered action button/row). Self-contained: it
 * reads its own session and fetches independently, so a slow or failed
 * Ranked lookup never blocks the rest of the Profile screen — this is a
 * secondary card, not the page's critical path.
 */
export function RankCard() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [loading, setLoading] = useState(userId !== null);
  const [singles, setSingles] = useState<PlayerRank | null>(null);
  const [doubles, setDoubles] = useState<PlayerRank | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([getPlayerRank(userId, 'singles'), getPlayerRank(userId, 'doubles')])
      .then(([s, d]) => {
        if (cancelled) return;
        setSingles(s);
        setDoubles(d);
      })
      .catch(() => {
        // A failed lookup reads the same as "no rank yet" — this card
        // never gets an error state of its own.
        if (cancelled) return;
        setSingles(null);
        setDoubles(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) return null;

  if (loading) {
    return <Skeleton height={88} radius={Radius.xl} />;
  }

  const primary = singles?.is_calibrated ? singles : doubles?.is_calibrated ? doubles : null;
  // Only ever the *other* mode, and only when both are calibrated —
  // otherwise there's nothing worth a second line.
  const secondary = primary === singles && doubles?.is_calibrated ? doubles : null;
  // A player_ranks row exists the instant a player's first ranked match
  // is created, at meaningless placeholder values — is_calibrated is
  // what makes a rank real. Someone mid-calibration already has a row
  // in one mode or the other and shouldn't see the same "try it" pitch
  // as someone who has never touched Ranked at all.
  const calibrating = !primary ? (singles ?? doubles) : null;

  if (!primary && !calibrating) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/ranked/leaderboard')}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
        ]}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: theme.accent }]}>
            <Ionicons name="trophy-outline" size={20} color={theme.accentForeground} />
          </View>
          <View style={styles.text}>
            <ThemedText type="smallBold">Try AIR/Rally Ranked</ThemedText>
            <ThemedText type="caption" themeColor="mutedForeground">
              A competitive singles/doubles ladder — start a ranked match from Open Play.
            </ThemedText>
          </View>
        </View>
        <ThemedText type="smallBold" themeColor="primary" style={styles.cta}>
          See the leaderboard →
        </ThemedText>
      </Pressable>
    );
  }

  if (calibrating) {
    const calibration = calibrationState(calibrating);
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/ranked/leaderboard')}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.navy, borderColor: theme.navy, opacity: pressed ? 0.85 : 1 },
        ]}>
        <ThemedText type="caption" style={[styles.eyebrow, { color: theme.primary }]}>
          Calibrating
        </ThemedText>
        <ThemedText type="subtitle" style={{ color: theme.navyForeground }}>
          {calibration.played} of {calibration.total} calibration matches played
        </ThemedText>
        <View style={styles.calibrationTrack}>
          {Array.from({ length: calibration.total }, (_, i) => (
            <View
              key={i}
              style={[
                styles.calibrationSegment,
                { backgroundColor: i < calibration.played ? theme.primary : `${theme.navyForeground}33` },
              ]}
            />
          ))}
        </View>
        <ThemedText type="caption" style={{ color: `${theme.navyForeground}CC` }}>
          Your tier stays hidden until match {calibration.total}. Results still count — they place you.
        </ThemedText>
      </Pressable>
    );
  }

  // Unreachable — the two branches above cover !primary — but narrows
  // `primary` for TypeScript below instead of a non-null assertion.
  if (!primary) return null;

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.row}>
        <RankBadge tier={primary.tier} size={40} />
        <View style={styles.text}>
          <ThemedText type="caption" themeColor="mutedForeground">
            {primary.mode === 'singles' ? 'Singles rank' : 'Doubles rank'}
          </ThemedText>
          <ThemedText type="subtitle">{rankLabel(primary.tier, primary.pips)}</ThemedText>
        </View>
      </View>

      {secondary ? (
        <View style={styles.secondaryRow}>
          <RankBadge tier={secondary.tier} size={20} />
          <ThemedText type="caption" themeColor="mutedForeground">
            Doubles · {rankLabel(secondary.tier, secondary.pips)}
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/ranked/leaderboard')}
          style={({ pressed }) => [styles.actionButton, { borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
          <ThemedText type="smallBold">View leaderboard</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/ranked/history')}
          style={({ pressed }) => [styles.actionButton, { borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
          <ThemedText type="smallBold">Match history</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  cta: {
    alignSelf: 'flex-end',
  },
  eyebrow: {
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  calibrationTrack: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
  },
  calibrationSegment: {
    flex: 1,
    borderRadius: 2,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
