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

/** searchPublicProfiles() runs a leading-wildcard ILIKE, which can't use
 * an index and forces a scan — firing it on every keystroke turns a
 * short name into several overlapping full scans. This batches
 * keystrokes into one search after typing pauses; requestSeq (below)
 * still decides which response wins once it fires. */
const SEARCH_DEBOUNCE_MS = 300;

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
 * `matchType` only picks a team size (2 slots vs. 4) — singles and
 * doubles share one rating, so a fetched `PlayerRank` is never mode-
 * specific. The parent screen still owns the singles/doubles toggle and
 * remounts this component on change (`key={matchType}`), which clears
 * every non-host slot for the new slot count — the RN equivalent of the
 * web reference's switchType(), without an effect that resets state
 * synchronously on every prop change.
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
  rated = true,
  onCreated,
  onSearchFocus,
  confirmBeforeCreate,
}: {
  host: PublicProfile;
  matchType: RankedMatchType;
  eventId?: string;
  courtId?: string;
  /** Fired when a slot's search field takes focus. The host screen owns
   * the scroll container, so it's the only thing that can bring this
   * field above the keyboard — and moving focus BETWEEN slots while the
   * keyboard is already up fires no keyboard event at all, so nothing
   * else would notice. See useKeyboardAwareScroll. */
  onSearchFocus?: () => void;
  /** create_ranked_match() itself skips the party-spread cap entirely
   * for an unrated match — casual play is exactly where a strong and
   * weak player deliberately pair up. Mirrored here rather than left to
   * the server alone, since this screen's own eligibility gate would
   * otherwise block a valid casual party for a rule that no longer
   * applies to it. */
  rated?: boolean;
  onCreated: (matchId: string) => void;
  /** Awaited before create_ranked_match() fires, when the caller passes
   * one — omitted by every other caller (e.g. the booked flow in
   * events/new.tsx), which stay untouched. A `false` resolution aborts
   * *before* `submitting` ever flips true, so declining never leaves
   * the Find match button stuck in a loading state. Built for the Play
   * doorway's calibrated-but-unbooked confirmation. */
  confirmBeforeCreate?: () => Promise<boolean>;
}) {
  const theme = useTheme();
  const { show } = useToast();

  const [slots, setSlots] = useState<Slot[]>(() => slotsFor(matchType, host));
  const [ranks, setRanks] = useState<Map<string, PlayerRank>>(new Map());
  // Which empty slot's own placeholder currently holds the search
  // field — never more than one at a time. The query/results belong to
  // this slot specifically, not the party as a whole, so switching
  // (or filling, or collapsing) it clears both.
  const [activeSlotKey, setActiveSlotKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const requestSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeInputRef = useRef<TextInput>(null);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Autofocus the moment a slot's search field appears — the whole
  // point of moving it into the slot is that tapping the slot is the
  // only gesture needed before typing.
  useEffect(() => {
    if (activeSlotKey) activeInputRef.current?.focus();
  }, [activeSlotKey]);

  async function fetchRank(userId: string) {
    try {
      const rank = await getPlayerRank(userId);
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
  // own rank. (The parent remounts this whole component on a matchType
  // switch, so there is no reset to do here — every other piece of
  // state above already starts fresh.)
  useEffect(() => {
    let cancelled = false;
    async function loadHostRank() {
      try {
        const rank = await getPlayerRank(host.id);
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

  function runSearch(value: string) {
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

  function fillSlot(key: string, player: PublicProfile) {
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, player } : s)));
    setActiveSlotKey(null);
    setQuery('');
    setResults([]);
    void fetchRank(player.id);
  }

  function clearSlot(key: string) {
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, player: null } : s)));
  }

  /** Tapping an empty slot opens its own search field; tapping the
   * same one again collapses it, same as any other disclosure. */
  function toggleSlotSearch(key: string) {
    const opening = activeSlotKey !== key;
    setActiveSlotKey(opening ? key : null);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setQuery('');
    setResults([]);
    setSearching(false);
  }

  const filledPlayers = slots.filter((s) => s.player).map((s) => s.player!);
  const allFilled = slots.every((s) => s.player);
  // Casual skips the spread cap entirely, same as the server — see the
  // `rated` prop's own comment.
  const eligibility = rated
    ? partyEligibilityDisplay(filledPlayers.map((p) => ranks.get(p.id) ?? null))
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
    if (!allFilled || !eligibility.eligible || submitting) return;
    if (confirmBeforeCreate && !(await confirmBeforeCreate())) return;
    setSubmitting(true);
    try {
      const teamA = slots.filter((s) => s.team === 'a').map((s) => s.player!.id);
      const teamB = slots.filter((s) => s.team === 'b').map((s) => s.player!.id);
      const matchId = await createRankedMatch({ matchType, teamA, teamB, eventId, courtId, rated });
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
          const active = activeSlotKey === slot.key;
          const rowContent = (
            <>
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
                ) : active ? (
                  <View style={styles.inlineSearchWrap}>
                    <TextInput
                      ref={activeInputRef}
                      value={query}
                      onChangeText={handleQueryChange}
                      placeholder={`Search for ${slot.roleLabel.toLowerCase()}`}
                      placeholderTextColor={theme.placeholder}
                      accessibilityLabel="Search players by name"
                      onFocus={onSearchFocus}
                      style={[styles.inlineSearchInput, { color: theme.cardForeground }]}
                    />
                    {searching ? <ActivityIndicator size="small" color={theme.mutedForeground} /> : null}
                  </View>
                ) : (
                  <ThemedText type="small" themeColor="mutedForeground">
                    Tap to search for {slot.roleLabel.toLowerCase()}
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
              ) : active ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Stop searching for ${slot.roleLabel.toLowerCase()}`}
                  onPress={() => toggleSlotSearch(slot.key)}
                  hitSlop={8}>
                  <Ionicons name="close" size={18} color={theme.mutedForeground} />
                </Pressable>
              ) : (
                <ThemedText type="caption" themeColor="mutedForeground" style={styles.roleLabel}>
                  {slot.roleLabel}
                </ThemedText>
              )}
            </>
          );
          return (
            <View key={slot.key}>
              {slot.isHost || slot.player || active ? (
                <View
                  style={[
                    styles.slotRow,
                    { backgroundColor: theme.card, borderColor: active ? theme.primary : theme.border },
                  ]}>
                  {rowContent}
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Search for ${slot.roleLabel.toLowerCase()}`}
                  onPress={() => toggleSlotSearch(slot.key)}
                  style={({ pressed }) => [
                    styles.slotRow,
                    { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
                  ]}>
                  {rowContent}
                </Pressable>
              )}

              {active ? (
                results.length > 0 ? (
                  <View style={[styles.results, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    {results.map((player) => (
                      <Pressable
                        key={player.id}
                        accessibilityRole="button"
                        onPress={() => fillSlot(slot.key, player)}
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
                ) : null
              ) : null}
            </View>
          );
        })}
      </View>

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
              A party this wide needs every player within {eligibility.maxSpread} ARR of each other — roughly{' '}
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
        // Uniform across both modes — founder's call: the Casual/Ranked
        // toggle above already says which one, and a button whose text
        // has to stay in sync with a toggle above it is a button that
        // can fall out of sync. It already did once, caught only on a
        // running screen. This removes the class of bug, not just today's.
        title={submitting ? 'Starting match…' : 'Find match'}
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
  inlineSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  inlineSearchInput: {
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
  eligibleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
