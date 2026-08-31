import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Avatar } from '@/components/post-card';
import { RankBadge } from '@/components/ranked/rank-badge';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PlayerRank, PublicProfile } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import {
  createRankedMatch,
  getPlayerRank,
  partyEligibilityDisplay,
  RankedError,
  rankLabel,
  RATING_STARTING_VALUE,
  splitDoublesTeamsByRating,
} from '@/lib/ranked';

const SEARCH_DEBOUNCE_MS = 300;
const MAX_PLAYERS = 4;

/**
 * Founder-approved, 2026-08-31: "we're all here, play now" — the
 * counterpart to Find match's broadcast. One search box, not one slot
 * per player: pick someone, the box clears, they land on a growing
 * list, repeat. Starts only at exactly 2 (singles) or exactly 4
 * (doubles, teams auto-split by rating via splitDoublesTeamsByRating) —
 * 3 is a genuine dead end here too, same rule as Open Match, just with
 * no broadcast to fall back on. Calls createRankedMatch() directly, the
 * same RPC the old slot-based builder used — this never touches
 * open_matches, since a scheduled broadcast makes no sense for four
 * people already standing on a court (CTO, 2026-08-31).
 */
export function RankedDirectInvite({
  host,
  rated = true,
  onSearchFocus,
  onCreated,
  confirmBeforeCreate,
}: {
  host: PublicProfile;
  /** create_ranked_match() itself skips the party-spread cap entirely
   * for an unrated match — mirrored here the same way RankedPartyBuilder
   * mirrors it, so this screen's own eligibility gate doesn't block a
   * valid casual party. */
  rated?: boolean;
  onSearchFocus?: () => void;
  onCreated: (matchId: string) => void;
  confirmBeforeCreate?: () => Promise<boolean>;
}) {
  const theme = useTheme();
  const { show } = useToast();

  const [invited, setInvited] = useState<PublicProfile[]>([]);
  const [ranks, setRanks] = useState<Map<string, PlayerRank>>(new Map());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const requestSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  async function fetchRank(userId: string) {
    try {
      const rank = await getPlayerRank(userId);
      if (rank) setRanks((prev) => new Map(prev).set(userId, rank));
    } catch {
      // Preview-only lookup — a failed fetch just leaves that player
      // unplaced in the eligibility/split preview, same posture as
      // RankedPartyBuilder's identical fetchRank.
    }
  }

  useEffect(() => {
    let cancelled = false;
    getPlayerRank(host.id)
      .then((rank) => {
        if (!cancelled && rank) setRanks((prev) => new Map(prev).set(host.id, rank));
      })
      .catch(() => {
        // Same posture as above — the host just previews as unplaced.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runSearch(value: string) {
    const seq = ++requestSeq.current;
    setSearching(true);
    searchPublicProfiles(value, 8)
      .then((profiles) => {
        if (seq !== requestSeq.current) return;
        const taken = new Set([host.id, ...invited.map((p) => p.id)]);
        setResults(profiles.filter((p) => !taken.has(p.id)));
      })
      .finally(() => {
        if (seq === requestSeq.current) setSearching(false);
      });
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (value.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    debounceTimer.current = setTimeout(() => runSearch(value), SEARCH_DEBOUNCE_MS);
  }

  function invite(player: PublicProfile) {
    setInvited((prev) => [...prev, player]);
    setQuery('');
    setResults([]);
    void fetchRank(player.id);
  }

  function uninvite(userId: string) {
    setInvited((prev) => prev.filter((p) => p.id !== userId));
  }

  const totalCount = 1 + invited.length;
  const canStartAt2 = totalCount === 2;
  const canStartAt4 = totalCount === 4;
  const canStart = canStartAt2 || canStartAt4;
  const allPlayers = [host, ...invited];

  // Casual skips the spread cap entirely, same as the server — see the
  // `rated` prop's own comment.
  const eligibility = rated
    ? partyEligibilityDisplay(canStart ? allPlayers.map((p) => ranks.get(p.id) ?? null) : [])
    : {
        eligible: true,
        spread: 0,
        allowedLowestRating: null,
        allowedHighestRating: null,
        allowedLowestTierName: null,
        allowedHighestTierName: null,
        maxSpread: 0,
      };

  async function submit() {
    if (!canStart || !eligibility.eligible || submitting) return;
    if (confirmBeforeCreate && !(await confirmBeforeCreate())) return;
    setSubmitting(true);
    try {
      let teamA: string[];
      let teamB: string[];
      if (canStartAt2) {
        teamA = [host.id];
        teamB = [invited[0].id];
      } else {
        const withRating = allPlayers.map((p) => ({ id: p.id, rating: ranks.get(p.id)?.rating ?? RATING_STARTING_VALUE }));
        const split = splitDoublesTeamsByRating(withRating as [(typeof withRating)[0], (typeof withRating)[0], (typeof withRating)[0], (typeof withRating)[0]]);
        teamA = split.teamA.map((p) => p.id);
        teamB = split.teamB.map((p) => p.id);
      }
      const matchId = await createRankedMatch({ matchType: canStartAt2 ? 'singles' : 'doubles', teamA, teamB, rated });
      onCreated(matchId);
    } catch (e) {
      show(e instanceof RankedError ? e.message : "We couldn't start that match.", 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">Invite players</ThemedText>
        <ThemedText type="caption" themeColor="mutedForeground">
          {totalCount} of {MAX_PLAYERS}
        </ThemedText>
      </View>

      <View style={styles.playerList}>
        {allPlayers.map((player) => {
          const rank = ranks.get(player.id);
          const placed = rank?.is_calibrated ?? false;
          const isHost = player.id === host.id;
          return (
            <View key={player.id} style={[styles.playerRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Avatar profile={player} size={40} />
              {placed && rank ? <RankBadge tier={rank.tier} size={32} /> : null}
              <View style={styles.playerInfo}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {player.display_name}
                  {isHost ? ' (you)' : ''}
                </ThemedText>
                <ThemedText type="caption" themeColor="mutedForeground">
                  {placed && rank ? rankLabel(rank.tier, rank.pips) : 'Not yet placed'}
                </ThemedText>
              </View>
              {isHost ? (
                <ThemedText type="caption" themeColor="rally" style={styles.roleLabel}>
                  HOST
                </ThemedText>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${player.display_name}`}
                  onPress={() => uninvite(player.id)}
                  hitSlop={8}>
                  <Ionicons name="close" size={18} color={theme.mutedForeground} />
                </Pressable>
              )}
            </View>
          );
        })}

        {totalCount < MAX_PLAYERS ? (
          <View>
            <View style={[styles.playerRow, styles.searchRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="search" size={18} color={theme.mutedForeground} />
              <TextInput
                ref={searchInputRef}
                value={query}
                onChangeText={handleQueryChange}
                placeholder="Search for a player to invite"
                placeholderTextColor={theme.placeholder}
                accessibilityLabel="Search players by name"
                onFocus={onSearchFocus}
                style={[styles.searchInput, { color: theme.cardForeground }]}
              />
              {searching ? <ActivityIndicator size="small" color={theme.mutedForeground} /> : null}
            </View>
            {results.length > 0 ? (
              <View style={[styles.results, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {results.map((player) => (
                  <Pressable
                    key={player.id}
                    accessibilityRole="button"
                    onPress={() => invite(player)}
                    style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.7 }]}>
                    <Avatar profile={player} size={28} />
                    <ThemedText type="small" numberOfLines={1} style={styles.resultName}>
                      {player.display_name}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            ) : query.trim().length >= 2 && !searching ? (
              <ThemedText type="caption" themeColor="mutedForeground" style={styles.noResults}>
                No players found. They need an AIR/Rally account first.
              </ThemedText>
            ) : null}
          </View>
        ) : null}
      </View>

      {totalCount === 3 ? (
        <ThemedText type="small" themeColor="mutedForeground">
          3 players can&apos;t start a match — invite one more for doubles, or remove one to play singles.
        </ThemedText>
      ) : null}

      {canStart && !eligibility.eligible ? (
        <View style={[styles.card, { backgroundColor: theme.destructiveSoft, borderColor: theme.destructiveSoft }]}>
          <ThemedText type="smallBold" style={{ color: theme.destructiveSoftForeground }}>
            Party rating difference too large
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.destructiveSoftForeground }}>
            Players with significantly different ratings can&apos;t currently join the same Ranked party.
          </ThemedText>
          {eligibility.allowedLowestTierName && eligibility.allowedHighestTierName ? (
            <ThemedText type="caption" style={{ color: theme.destructiveSoftForeground }}>
              A party this wide needs every player within {eligibility.maxSpread} ARR of each other — roughly{' '}
              {eligibility.allowedLowestTierName} to {eligibility.allowedHighestTierName}.
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      <Button
        title={submitting ? 'Starting match…' : 'Start match'}
        onPress={submit}
        disabled={!canStart || !eligibility.eligible || submitting}
        loading={submitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  playerList: {
    gap: Spacing.two,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  searchRow: {
    paddingVertical: Spacing.three,
  },
  playerInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  roleLabel: {
    letterSpacing: 0.5,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  noResults: {
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  results: {
    marginTop: Spacing.one,
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
  resultName: {
    flexShrink: 1,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
