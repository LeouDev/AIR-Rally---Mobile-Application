import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/post-card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { expiresInLabel, listOpenMatchesForCity, type OpenMatchListing } from '@/lib/open-match';

/**
 * "A list of open games near you on the Play tab" — the in-app surface
 * the design calls out as necessary alongside push, not optional: push
 * can always be permanently declined (iOS won't let the app require
 * it), and this is what makes the feature work for everyone regardless,
 * plus serves the player who opens the app wanting a game right now
 * rather than waiting for a notification that may have already fired.
 *
 * Read-only for now — tapping a row will open the join flow once that
 * exists; there is no onPress yet because there is nowhere to send one.
 *
 * Callers MUST pass `key={citySlug}` alongside the prop when citySlug
 * can change while mounted (e.g. after the city picker). That's what
 * clears the previous city's stale list before the new one's fetch
 * resolves — a full remount via key change, not a manual reset inside
 * this effect, which the app's stricter react-hooks lint (no
 * synchronous setState in an effect body) doesn't allow anyway.
 */
export function OpenGamesSection({ citySlug }: { citySlug: string | null }) {
  const theme = useTheme();
  // undefined = not fetched yet, [] = fetched and genuinely empty.
  const [games, setGames] = useState<OpenMatchListing[] | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Nothing to reset here: the component returns null below whenever
    // citySlug is falsy, so a stale `games` value never gets a chance
    // to render regardless of what this effect does with it. A change
    // FROM one real city TO another relies on the caller's key={citySlug}
    // remounting this component fresh — see the doc comment above.
    if (!citySlug) return;
    let cancelled = false;
    listOpenMatchesForCity(citySlug)
      .then((result) => {
        if (!cancelled) setGames(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [citySlug]);

  if (!citySlug) return null;

  return (
    <View style={styles.stack}>
      <ThemedText type="smallBold">Open games near you</ThemedText>

      {error ? (
        <ThemedText type="small" themeColor="destructive">
          Couldn&apos;t load open games. Pull to retry.
        </ThemedText>
      ) : games === undefined ? (
        <ThemedText type="small" themeColor="subtle">
          Loading…
        </ThemedText>
      ) : games.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <ThemedText type="small" themeColor="subtle">
            No open games right now. Start one and be the first.
          </ThemedText>
        </View>
      ) : (
        <View style={[styles.list, { borderColor: theme.border, backgroundColor: theme.card }]}>
          {games.map((game, i) => (
            <Pressable
              key={game.id}
              accessibilityRole="button"
              accessibilityLabel={`${game.host?.display_name ?? 'A player'}'s open game`}
              disabled
              style={[styles.row, i < games.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.hairline }]}>
              <Avatar profile={game.host} size={40} />
              <View style={styles.rowText}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {game.host?.display_name ?? 'A player'}&apos;s game
                </ThemedText>
                <ThemedText type="caption" themeColor="mutedForeground">
                  {game.acceptedCount} {game.acceptedCount === 1 ? 'player' : 'players'} in · {expiresInLabel(game.created_at)}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.two,
  },
  empty: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    alignItems: 'center',
  },
  list: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
});
