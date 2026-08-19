import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PublicProfile } from '@/lib/database.types';
import { calculateSplit, formatShare } from '@/lib/event-split';
import { searchPublicProfiles } from '@/lib/follows';

/**
 * "Who's playing?" — picks the playmates coming to a booking or game.
 *
 * These are placeholders on a roster, NOT payers. One person pays the
 * venue for the whole court; this only records who's expected and shows
 * what an even split would come to. AIR/Rally collects nothing from the
 * others — port of the web's PlayerPicker.
 */
export function PlayerPicker({
  selected,
  onChange,
  totalAmount,
  currency = 'PHP',
  excludeUserId,
}: {
  selected: PublicProfile[];
  onChange: (players: PublicProfile[]) => void;
  /** The booking total, integer minor units. Drives the share preview. */
  totalAmount: number;
  currency?: string;
  excludeUserId?: string | null;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const requestSeq = useRef(0);

  const split = calculateSplit(totalAmount, selected.length + 1);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const seq = ++requestSeq.current;
    setSearching(true);
    searchPublicProfiles(value, 8)
      .then((profiles) => {
        if (seq !== requestSeq.current) return;
        const chosen = new Set(selected.map((p) => p.id));
        setResults(profiles.filter((p) => p.id !== excludeUserId && !chosen.has(p.id)));
      })
      .finally(() => {
        if (seq === requestSeq.current) setSearching(false);
      });
  };

  const add = (player: PublicProfile) => {
    onChange([...selected, player]);
    setQuery('');
    setResults([]);
  };

  const remove = (playerId: string) => {
    onChange(selected.filter((p) => p.id !== playerId));
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.muted, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">Who&apos;s playing?</ThemedText>
        <ThemedText type="caption" themeColor="mutedForeground">
          Optional
        </ThemedText>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={handleQueryChange}
          placeholder="Search players by name"
          placeholderTextColor={theme.placeholder}
          accessibilityLabel="Search players by name"
          style={[styles.input, { backgroundColor: theme.card, borderColor: theme.input, color: theme.cardForeground }]}
        />
        {searching ? <ActivityIndicator style={styles.spinner} color={theme.mutedForeground} /> : null}
      </View>

      {results.length > 0 ? (
        <View style={[styles.results, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {results.map((player) => (
            <Pressable
              key={player.id}
              accessibilityRole="button"
              onPress={() => add(player)}
              style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.7 }]}>
              <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
                <ThemedText type="caption" style={{ color: theme.accentForeground }}>
                  {(player.display_name ?? '?').slice(0, 1).toUpperCase()}
                </ThemedText>
              </View>
              <ThemedText type="small" numberOfLines={1} style={styles.resultName}>
                {player.display_name}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      ) : query.trim().length >= 2 && !searching ? (
        <ThemedText type="caption" themeColor="mutedForeground">
          No players found. They need an AIR/Rally account to be added.
        </ThemedText>
      ) : null}

      {selected.length > 0 ? (
        <View style={styles.chipRow}>
          {selected.map((player) => (
            <View key={player.id} style={[styles.chip, { backgroundColor: theme.accent }]}>
              <ThemedText type="caption" style={{ color: theme.accentForeground }}>
                {player.display_name}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${player.display_name}`}
                onPress={() => remove(player.id)}
                hitSlop={8}>
                <Ionicons name="close" size={14} color={theme.accentForeground} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {selected.length > 0 && totalAmount > 0 ? (
        <View style={[styles.splitCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ThemedText type="small">
            <ThemedText type="smallBold">{formatShare(split.sharePerPlayer, currency)}</ThemedText> each if you split it{' '}
            {split.playerCount} ways
          </ThemedText>
          <ThemedText type="caption" themeColor="mutedForeground">
            You pay the venue in full. Settling up with your group is between you — AIR/Rally doesn&apos;t collect from them.
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    minHeight: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  spinner: {
    position: 'absolute',
    right: Spacing.three,
  },
  results: {
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultName: {
    flexShrink: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },
  splitCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.two,
    gap: 4,
  },
});
