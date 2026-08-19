import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PublicProfile, RankedOfficiatingMode } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import {
  listRefereeCandidates,
  officiatingTally,
  proposeOfficiating,
  RankedError,
  voteOfficiating,
  type RankedMatchDetail,
} from '@/lib/ranked';

function initials(name: string | null): string {
  return (name ?? '?').trim().slice(0, 2).toUpperCase();
}

type PickerView = 'mode' | 'referee' | 'scorekeeper';

/**
 * "Find referee" and "no referee available?" live in one component with
 * local view state rather than as separate screens — both paths converge
 * on the same propose_ranked_officiating() call and the same
 * unanimous-vote view once a scorekeeper is proposed. Ported from the
 * web's OfficiatingPhase.tsx.
 */
export function OfficiatingPhase({ match, currentUserId }: { match: RankedMatchDetail; currentUserId: string }) {
  const theme = useTheme();
  const { show } = useToast();
  const [view, setView] = useState<PickerView>('mode');
  // null = not fetched yet for this referee-picker visit.
  const [candidates, setCandidates] = useState<PublicProfile[] | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [busy, setBusy] = useState(false);

  const me = match.players.find((p) => p.user_id === currentUserId);
  const proposed = Boolean(match.scorekeeper_id);
  const excludeIds = match.players.map((p) => p.user_id);

  useEffect(() => {
    if (view !== 'referee' || match.event_id === null || proposed) return;
    let cancelled = false;
    listRefereeCandidates(match.event_id, excludeIds)
      .catch(() => [] as PublicProfile[])
      .then((found) => {
        if (!cancelled) setCandidates(found);
      });
    return () => {
      cancelled = true;
    };
    // excludeIds is derived fresh from match.players every render; keying
    // on match.players would refetch on every unrelated ready/vote change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, match.event_id, proposed]);

  const openRefereePicker = () => {
    setCandidates(null);
    setView('referee');
  };

  const handleRefereeSearch = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchPublicProfiles(value)
      .then((results) => {
        const excluded = new Set(excludeIds);
        setSearchResults(results.filter((p) => !excluded.has(p.id)));
      })
      .catch(() => setSearchResults([]));
  };

  const propose = async (mode: RankedOfficiatingMode, scorekeeperId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await proposeOfficiating(match.id, mode, scorekeeperId);
    } catch (err) {
      show(err instanceof RankedError ? err.message : "That didn't go through. Try again.", 'error');
    } finally {
      setBusy(false);
    }
  };

  const vote = async (approve: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await voteOfficiating(match.id, approve);
    } catch (err) {
      show(err instanceof RankedError ? err.message : "That didn't go through. Try again.", 'error');
    } finally {
      setBusy(false);
    }
  };

  if (proposed) {
    const scorekeeper = match.scorekeeper ?? match.players.find((p) => p.user_id === match.scorekeeper_id)?.profile ?? null;
    const tally = officiatingTally(match.players);
    const myVote = me?.officiating_vote ?? null;

    return (
      <View style={styles.stack}>
        <Header />

        <View style={[styles.card, { borderColor: theme.navy, backgroundColor: theme.card }]}>
          <View style={styles.proposedHeader}>
            <View style={[styles.avatarLg, { backgroundColor: theme.navy }]}>
              <ThemedText type="subtitle" style={{ color: theme.navyForeground }}>
                {initials(scorekeeper?.display_name ?? null)}
              </ThemedText>
            </View>
            <View style={styles.info}>
              <ThemedText type="subtitle" numberOfLines={1}>
                {scorekeeper?.display_name ?? 'Scorekeeper'}
              </ThemedText>
              <ThemedText type="caption" themeColor="mutedForeground">
                {match.officiating_mode === 'referee' ? 'Not in this match' : 'One of the four players'}
              </ThemedText>
            </View>
          </View>

          <View style={[styles.rule, { backgroundColor: theme.navy }]} />

          <View style={styles.voteList}>
            {match.players.map((p) => (
              <View key={p.user_id} style={styles.voteRow}>
                <ThemedText type="small">{p.profile?.display_name ?? 'Player'}</ThemedText>
                <ThemedText
                  type="caption"
                  style={{ color: p.officiating_vote ? theme.rally : theme.mutedForeground, fontWeight: '700' }}>
                  {p.officiating_vote ? 'AGREED' : 'PENDING'}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>

        <View>
          <View style={styles.tallyHeader}>
            <ThemedText type="caption" themeColor="mutedForeground">
              UNANIMOUS APPROVAL
            </ThemedText>
            <ThemedText type="smallBold">
              {tally.approved} / {tally.total}
            </ThemedText>
          </View>
          <View style={styles.tallyBars}>
            {match.players.map((p) => (
              <View
                key={p.user_id}
                style={[styles.tallyBar, { backgroundColor: p.officiating_vote ? theme.rally : theme.muted }]}
              />
            ))}
          </View>
        </View>

        {me ? (
          <View style={styles.stackSmall}>
            <Button title={myVote === true ? "You agreed" : 'Agree'} onPress={() => vote(true)} disabled={busy || myVote === true} />
            <Button
              title={match.officiating_mode === 'referee' ? 'No referee available?' : 'Try a referee instead'}
              variant="outline"
              onPress={() => (match.officiating_mode === 'referee' ? setView('scorekeeper') : openRefereePicker())}
              disabled={busy}
            />
          </View>
        ) : null}
      </View>
    );
  }

  if (view === 'mode') {
    return (
      <View style={styles.stack}>
        <Header />
        <Pressable
          accessibilityRole="button"
          onPress={openRefereePicker}
          style={({ pressed }) => [styles.optionCard, { borderColor: theme.border }, pressed && styles.pressed]}>
          <ThemedText type="subtitle">Find referee</ThemedText>
          <ThemedText type="small" themeColor="subtle">
            A non-playing person calls the score from courtside. All four players must approve.
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setView('scorekeeper')}
          style={({ pressed }) => [styles.optionCard, { borderColor: theme.border }, pressed && styles.pressed]}>
          <ThemedText type="subtitle">Use player scorekeeper</ThemedText>
          <ThemedText type="small" themeColor="subtle">
            One of the four players manages the official score.
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  if (view === 'scorekeeper') {
    return (
      <View style={styles.stack}>
        <BackLink onPress={() => setView('mode')} />
        <ThemedText type="smallBold">Who keeps score?</ThemedText>
        <View style={[styles.list, { borderColor: theme.navy, backgroundColor: theme.card }]}>
          {match.players.map((p, i) => (
            <Pressable
              key={p.user_id}
              accessibilityRole="button"
              onPress={() => propose('player_scorekeeper', p.user_id)}
              disabled={busy}
              style={({ pressed }) => [
                styles.listRow,
                i < match.players.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.hairline },
                (pressed || busy) && styles.pressed,
              ]}>
              <View style={[styles.avatarSm, { backgroundColor: theme.navy }]}>
                <ThemedText type="caption" style={{ color: theme.navyForeground }}>
                  {initials(p.profile?.display_name ?? null)}
                </ThemedText>
              </View>
              <ThemedText type="smallBold">
                {p.profile?.display_name ?? 'Player'}
                {p.user_id === currentUserId ? ' (you)' : ''}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  // view === 'referee'
  return (
    <View style={styles.stack}>
      <BackLink onPress={() => setView('mode')} />
      <ThemedText type="smallBold">Who&apos;s refereeing?</ThemedText>

      {match.event_id ? (
        candidates === null ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.mutedForeground} />
            <ThemedText type="small" themeColor="subtle">
              Checking who&apos;s courtside…
            </ThemedText>
          </View>
        ) : candidates.length > 0 ? (
          <View style={[styles.list, { borderColor: theme.navy, backgroundColor: theme.card }]}>
            {candidates.map((c, i) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => propose('referee', c.id)}
                disabled={busy}
                style={({ pressed }) => [
                  styles.listRowBetween,
                  i < candidates.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.hairline },
                  (pressed || busy) && styles.pressed,
                ]}>
                <View style={styles.rowLeft}>
                  <View style={[styles.avatarSm, { backgroundColor: theme.navy }]}>
                    <ThemedText type="caption" style={{ color: theme.navyForeground }}>
                      {initials(c.display_name)}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold">{c.display_name}</ThemedText>
                </View>
                <ThemedText type="caption" style={{ color: theme.rally, fontWeight: '700' }}>
                  AVAILABLE COURTSIDE
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={[styles.noticeCard, { borderColor: theme.border }]}>
            <ThemedText type="small" themeColor="subtle">
              Nobody else at this session is free right now. Search by name instead, or use a player scorekeeper.
            </ThemedText>
          </View>
        )
      ) : null}

      <View style={[styles.searchWrap, { backgroundColor: theme.card, borderColor: theme.input }]}>
        <Ionicons name="search" size={16} color={theme.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={handleRefereeSearch}
          placeholder="Search players by name"
          placeholderTextColor={theme.placeholder}
          accessibilityLabel="Search players by name"
          style={[styles.searchInput, { color: theme.cardForeground }]}
        />
      </View>

      {searchResults.length > 0 ? (
        <View style={[styles.list, { borderColor: theme.navy, backgroundColor: theme.card }]}>
          {searchResults.map((p, i) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => propose('referee', p.id)}
              disabled={busy}
              style={({ pressed }) => [
                styles.listRow,
                i < searchResults.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.hairline },
                (pressed || busy) && styles.pressed,
              ]}>
              <View style={[styles.avatarSm, { backgroundColor: theme.muted }]}>
                <ThemedText type="caption">{initials(p.display_name)}</ThemedText>
              </View>
              <ThemedText type="small">{p.display_name}</ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Header() {
  return (
    <View>
      <ThemedText type="caption" themeColor="mutedForeground" style={styles.eyebrow}>
        ALL PLAYERS READY
      </ThemedText>
      <ThemedText type="heading" style={styles.title}>
        Select referee
      </ThemedText>
    </View>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={styles.backLink}>
      <Ionicons name="chevron-back" size={16} color={theme.mutedForeground} />
      <ThemedText type="caption" themeColor="mutedForeground">
        Back
      </ThemedText>
    </Pressable>
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
  card: {
    borderWidth: 2,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  proposedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatarLg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  info: {
    flex: 1,
    gap: Spacing.half,
    minWidth: 0,
  },
  rule: {
    height: 2,
  },
  voteList: {
    gap: Spacing.two,
  },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tallyHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  tallyBars: {
    flexDirection: 'row',
    gap: 4,
  },
  tallyBar: {
    flex: 1,
    height: 12,
  },
  optionCard: {
    borderWidth: 2,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
  },
  list: {
    borderWidth: 2,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  listRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    flexShrink: 1,
  },
  avatarSm: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.three,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    fontSize: 16,
  },
});
