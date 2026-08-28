import { useEffect, useId, useState } from 'react';

import { getMatch, type RankedMatchDetail } from '@/lib/ranked';
import { supabase } from '@/lib/supabase';

/** Backstop only — Realtime is the actual delivery mechanism. See below. */
const FALLBACK_POLL_MS = 5000;

/**
 * Keeps a ranked match room live. The scorekeeper's device writes a
 * point; every other player's screen has to reflect it in close to real
 * time without a manual refresh — a scoreboard four people are watching
 * together doesn't work as a poll.
 *
 * This is the first use of supabase.channel(...) anywhere in this app —
 * everything else so far has been plain request/response. Strategy:
 * on any change to this match's row or its players' rows, refetch the
 * whole match detail rather than patching individual fields from the
 * Realtime payload — a ranked match room is low-frequency (points are
 * seconds apart) and getMatch() is a handful of queries under RLS
 * everyone here can already read; patching partial state correctly
 * (joined profiles, derived tier snapshots) would be more code for a
 * difference nobody would notice. Mirrors the web repo's
 * lib/hooks/useRankedMatch.ts exactly for this reasoning.
 *
 * The interval poll is a backstop, not the delivery mechanism —
 * Realtime is. It exists because a channel can report SUBSCRIBED and
 * then silently deliver nothing, with no error anywhere a client can
 * see: this exact failure mode already showed up once on this feature
 * server-side (the ranked_* tables needed REPLICA IDENTITY FULL for
 * Realtime to evaluate their RLS policies on UPDATE), and there's no way
 * to prove from the client alone that some other silent gap isn't
 * waiting in a different environment. Five seconds keeps a stuck screen
 * from staying stuck for more than a few points.
 */
export function useRankedMatch(matchId: string, initial: RankedMatchDetail) {
  const [match, setMatch] = useState<RankedMatchDetail>(initial);
  // Supabase dedupes channels by topic string across the whole client — a
  // second `.channel('ranked-match-<id>')` call while a first is still
  // subscribed (e.g. two mounts of this same route, or a remount racing
  // its own async removeChannel()) returns THAT already-subscribed
  // channel rather than a fresh one, and chaining .on() on it throws
  // "cannot add postgres_changes callbacks... after subscribing". useId()
  // is stable for this component instance's whole lifetime and distinct
  // from every other instance's, so two simultaneous mounts — or an old
  // mount and its replacement — never collide on the same topic. Confirmed
  // in production 2026-08-28, the app's first live-scored match.
  const instanceId = useId();

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const fresh = await getMatch(matchId).catch(() => null);
      if (fresh && !cancelled) setMatch(fresh);
    }

    void refresh();

    const channel = supabase
      .channel(`ranked-match-${matchId}-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ranked_matches', filter: `id=eq.${matchId}` }, refresh)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ranked_match_players', filter: `match_id=eq.${matchId}` },
        refresh
      )
      .subscribe();

    const interval = setInterval(() => void refresh(), FALLBACK_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [matchId, instanceId]);

  return match;
}
