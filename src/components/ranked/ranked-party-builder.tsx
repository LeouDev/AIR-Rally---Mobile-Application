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
import type { PlayerRank, PublicProfile, RankedMatchType, RankedTeam } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import { createRankedMatch, getPlayerRank, partyEligibilityDisplay, RankedError, rankLabel } from '@/lib/ranked';

type Slot = {
  key: string;
  team: RankedTeam;
  /** The one fixed slot — never searched, never removed. */
  isHost?: boolean;
  roleLabel: string;
  player: PublicProfile | null;
};

function slotsFor(matchType: RankedMatchType, host: PublicProfile): Slot[] {
  const hostSlot: Slot = { key: 'host', team: 'a', isHost: true, roleLabel: 'HOST', player: host };
  if (matchType === 'singles') {
    return [hostSlot, { key: 'opp1', team: 'b', roleLabel: 'OPPONENT', player: null }];
  }
  return [
    hostSlot,
    { key: 'partner', team: 'a', roleLabel: 'PARTNER', player: null },
    { key: 'opp1', team: 'b', roleLabel: 'OPPONENT', player: null },
    { key: 'opp2', team: 'b', roleLabel: 'OPPONENT', player: null },
  ];
}

/**
 * Assembles a ranked party and starts the match — port of the web
 * repo's RankedPartyBuilder (components/ranked/RankedPartyBuilder.tsx).
 *
 * The host is a fixed slot; everyone else is picked by name search (the
 * same `searchPublicProfiles` the Open Play roster picker uses, see
 * `components/player-picker.tsx`) and lands in the first open slot.
 * Team assignment happens here, at setup — this is a challenge-your-
 * friends flow, not a public queue.
 *
 * Singles and doubles are independent ratings, so every fetched
 * `PlayerRank` — including the host's — is specific to the current
 * `matchType`. The parent screen owns the singles/doubles toggle and
 * remounts this component on change (`key={matchType}`), which is what
 * clears every non-host slot and the whole rank cache — the RN
 * equivalent of the web reference's switchType(), without an effect
 * that resets state synchronously on every prop change.
 *
 * Does not navigate on success — `onCreated(matchId)` hands that back
 * to the caller, which has its own flow to finish first (see
 * app/events/new.tsx).
 */
export function RankedPartyBuilder({
  host,
  matchType,
  eventId,
  courtId,
  onCreated,
}: {
  host: PublicProfile;
  matchType: RankedMatchType;
  eventId?: string;
  courtId?: string;
  onCreated: (matchId: string) => void;
}) {
  const theme = useTheme();
  const { show } = useToast();

  const [slots, setSlots] = useState<Slot[]>(() => slotsFor(matchType, host));
  const [ranks, setRanks] = useState<Map<string, PlayerRank>>(new Map());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const requestSeq = useRef(0);

  async function fetchRank(userId: string, mode: RankedMatchType) {
    try {
      const rank = await getPlayerRank(userId, mode);
      if (rank) {
        setRanks((prev) => new Map(prev).set(userId, rank));
      } else {
        setRanks((prev) => {
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
      }
    } catch {
      // The lookup failed — the eligibility preview just treats them as
      // unplaced, same as a real uncalibrated player.
    }
  }

  // The one thing this mount still needs from the network: the host's
  // own rank for this matchType. (The parent remounts this whole
  // component on a matchType switch, so there is no reset to do here —
  // every other piece of state above already starts fresh.)
  useEffect(() => {
    let cancelled = false;
    async function loadHostRank() {
      try {
        const rank = await getPlayerRank(host.id, matchType);
        if (!cancelled && rank) setRanks((prev) => new Map(prev).set(host.id, rank));
      } catch {
        // The lookup failed — the eligibility preview just treats the
        // host as unplaced, same as a real uncalibrated player.
      }
    }
    void loadHostRank();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleQueryChange(value: string) {
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
        const taken = new Set(slots.filter((s) => s.player).map((s) => s.player!.id));
        setResults(profiles.filter((p) => !taken.has(p.id)));
      })
      .finally(() => {
        if (seq === requestSeq.current) setSearching(false);
      });
  }

  function fillNextSlot(player: PublicProfile) {
    const openIndex = slots.findIndex((s) => !s.isHost && !s.player);
    if (openIndex === -1) return;
    setSlots((prev) => prev.map((s, i) => (i === openIndex ? { ...s, player } : s)));
    setQuery('');
    setResults([]);
    void fetchRank(player.id, matchType);
  }

  function clearSlot(key: string) {
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, player: null } : s)));
  }

  const filledPlayers = slots.filter((s) => s.player).map((s) => s.player!);
  const allFilled = slots.every((s) => s.player);
  const eligibility = partyEligibilityDisplay(filledPlayers.map((p) => ranks.get(p.id) ?? null));

  async function submit() {
    if (!allFilled || !eligibility.eligible || submitting) return;
    setSubmitting(true);
    try {
      const teamA = slots.filter((s) => s.team === 'a').map((s) => s.player!.id);
      const teamB = slots.filter((s) => s.team === 'b').map((s) => s.player!.id);
      const matchId = await createRankedMatch({ matchType, teamA, teamB, eventId, courtId });
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
        <ThemedText type="smallBold">Party</ThemedText>
        <ThemedText type="caption" themeColor="mutedForeground">
          {filledPlayers.length} of {slots.length}
        </ThemedText>
      </View>

      <View style={styles.slotList}>
        {slots.map((slot) => {
          // A PlayerRank row exists, at meaningless placeholder values,
          // the instant someone opens Ranked for the first time — only
          // is_calibrated means "placed". Showing a tier badge before
          // that would tell this player a fake rank.
          const rank = slot.player ? ranks.get(slot.player.id) : undefined;
          const placed = rank?.is_calibrated ?? false;
          return (
            <View key={slot.key} style={[styles.slotRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Avatar profile={slot.player} size={40} />
              {placed && rank ? <RankBadge tier={rank.tier} size={32} /> : null}
              <View style={styles.slotInfo}>
                {slot.player ? (
                  <>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {slot.player.display_name}
                      {slot.isHost ? ' (you)' : ''}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="mutedForeground">
                      {placed && rank ? rankLabel(rank.tier, rank.pips) : 'Not yet placed'}
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText type="small" themeColor="mutedForeground">
                    Search below to fill this spot
                  </ThemedText>
                )}
              </View>
              {slot.isHost ? (
                <ThemedText type="caption" themeColor="rally" style={styles.roleLabel}>
                  {slot.roleLabel}
                </ThemedText>
              ) : slot.player ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${slot.player.display_name}`}
                  onPress={() => clearSlot(slot.key)}
                  hitSlop={8}>
                  <Ionicons name="close" size={18} color={theme.mutedForeground} />
                </Pressable>
              ) : (
                <ThemedText type="caption" themeColor="mutedForeground" style={styles.roleLabel}>
                  {slot.roleLabel}
                </ThemedText>
              )}
            </View>
          );
        })}
      </View>

      {!allFilled ? (
        <View style={styles.searchBlock}>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={theme.mutedForeground} style={styles.searchIcon} />
            <TextInput
              value={query}
              onChangeText={handleQueryChange}
              placeholder="Search players by name"
              placeholderTextColor={theme.placeholder}
              accessibilityLabel="Search players by name"
              style={[
                styles.input,
                { backgroundColor: theme.card, borderColor: theme.input, color: theme.cardForeground },
              ]}
            />
            {searching ? <ActivityIndicator style={styles.spinner} color={theme.mutedForeground} /> : null}
          </View>

          {results.length > 0 ? (
            <View style={[styles.results, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {results.map((player) => (
                <Pressable
                  key={player.id}
                  accessibilityRole="button"
                  onPress={() => fillNextSlot(player)}
                  style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.7 }]}>
                  <Avatar profile={player} size={28} />
                  <ThemedText type="small" numberOfLines={1} style={styles.resultName}>
                    {player.display_name}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : query.trim().length >= 2 && !searching ? (
            <ThemedText type="caption" themeColor="mutedForeground">
              No players found. They need an AIR/Rally account first.
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      {allFilled && !eligibility.eligible ? (
        <View style={[styles.card, { backgroundColor: theme.destructiveSoft, borderColor: theme.destructiveSoft }]}>
          <ThemedText type="smallBold" style={{ color: theme.destructiveSoftForeground }}>
            Party rating difference too large
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.destructiveSoftForeground }}>
            Players with significantly different ratings can&apos;t currently join the same Ranked party.
          </ThemedText>
          {eligibility.allowedLowestTierName && eligibility.allowedHighestTierName ? (
            <ThemedText type="caption" style={{ color: theme.destructiveSoftForeground }}>
              A party this wide needs every player within {eligibility.maxSpread} AAR of each other — roughly{' '}
              {eligibility.allowedLowestTierName} to {eligibility.allowedHighestTierName}.
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      {allFilled && eligibility.eligible ? (
        <View
          style={[
            styles.card,
            styles.eligibleRow,
            { backgroundColor: theme.successSoft, borderColor: theme.successSoft },
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.successSoftForeground }}>
            Party eligible
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.successSoftForeground }}>
            Ready
          </ThemedText>
        </View>
      ) : null}

      <Button
        title={submitting ? 'Starting match…' : 'Find ranked match'}
        onPress={submit}
        disabled={!allFilled || !eligibility.eligible || submitting}
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
  slotList: {
    gap: Spacing.two,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  slotInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  roleLabel: {
    letterSpacing: 0.5,
  },
  searchBlock: {
    gap: Spacing.two,
  },
  searchWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: Spacing.three,
    zIndex: 1,
  },
  input: {
    minHeight: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingLeft: Spacing.four + Spacing.two,
    paddingRight: Spacing.three,
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
  resultName: {
    flexShrink: 1,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  eligibleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
