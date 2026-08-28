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
import { calibrationState, formatRating, getPlayerRank, rankLabel } from '@/lib/ranked';
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
  const [rank, setRank] = useState<PlayerRank | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getPlayerRank(userId)
      .then((r) => {
        if (!cancelled) setRank(r);
      })
      .catch(() => {
        // A failed lookup reads the same as "no rank yet" — this card
        // never gets an error state of its own.
        if (!cancelled) setRank(null);
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

  const primary = rank?.is_calibrated ? rank : null;
  const calibrating = !primary ? rank : null;

  if (!primary && !calibrating) {
    return (
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: theme.accent }]}>
            <Ionicons name="trophy-outline" size={20} color={theme.accentForeground} />
          </View>
          <View style={styles.text}>
            <ThemedText type="smallBold">Try AIR/Rally Ranked</ThemedText>
            <ThemedText type="caption" themeColor="mutedForeground">
              A competitive singles/doubles ladder — no booking needed for your first 10 matches.
            </ThemedText>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/ranked/play')}
            style={({ pressed }) => [styles.actionButton, { borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
            <ThemedText type="smallBold">Play a game</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/ranked/leaderboard')}
            style={({ pressed }) => [styles.actionButton, { borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
            <ThemedText type="smallBold">Leaderboard</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  if (calibrating) {
    const calibration = calibrationState(calibrating);
    return (
      <View style={[styles.card, { backgroundColor: theme.navy, borderColor: theme.navy }]}>
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
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/ranked/play')}
          style={({ pressed }) => [
            styles.actionButton,
            { borderColor: theme.primary, opacity: pressed ? 0.85 : 1 },
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>
            Play a game
          </ThemedText>
        </Pressable>
      </View>
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
            AIR/Rally Rank
          </ThemedText>
          <ThemedText type="subtitle">{rankLabel(primary.tier, primary.pips)}</ThemedText>
          <ThemedText type="caption" style={{ color: theme.primary }}>
            AAR {formatRating(primary.rating)}
          </ThemedText>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/ranked/play')}
          style={({ pressed }) => [styles.actionButton, { borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
          <ThemedText type="smallBold">Play a game</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/ranked/leaderboard')}
          style={({ pressed }) => [styles.actionButton, { borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
          <ThemedText type="smallBold">Leaderboard</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/ranked/games')}
          style={({ pressed }) => [styles.actionButton, { borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
          <ThemedText type="smallBold">My games</ThemedText>
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
