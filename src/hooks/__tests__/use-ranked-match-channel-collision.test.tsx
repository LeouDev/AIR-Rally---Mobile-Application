import { render } from '@testing-library/react-native';
import React from 'react';

import { useRankedMatch } from '@/hooks/use-ranked-match';
import type { RankedMatch } from '@/lib/database.types';
import type { RankedMatchDetail } from '@/lib/ranked';
import { supabase } from '@/lib/supabase';

/**
 * Production crash, 2026-08-28, the app's first live-scored ranked
 * match: "cannot add postgres_changes callbacks... after subscribing to
 * the channel." Two mounts of the same match route — e.g. a notification
 * tap pushing `/ranked/[matchId]` while that screen is already open,
 * since notifications-runtime.ts uses router.push (always adds a new
 * screen), not router.navigate (which would reuse an existing one) — each
 * ran useRankedMatch(matchId, ...) and both tried `.channel('ranked-match-
 * <id>')`. Supabase dedupes channels by topic string across the whole
 * client, so the second call got back the FIRST instance's
 * already-subscribed channel object, and its own `.on()` chain threw.
 *
 * This mock reproduces that real dedupe-by-topic behavior deliberately
 * (not a generic jest.fn() per call) — it's the only way this test can
 * tell a real fix from one that merely changes what gets thrown.
 */

jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getMatch: jest.fn().mockResolvedValue(null),
}));

const mockChannelRegistry = new Map<string, { subscribed: boolean; on: jest.Mock; subscribe: jest.Mock }>();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: jest.fn((topic: string) => {
      const existing = mockChannelRegistry.get(topic);
      if (existing) return existing;
      const entry: { subscribed: boolean; on: jest.Mock; subscribe: jest.Mock } = {
        subscribed: false,
        on: jest.fn(() => {
          if (entry.subscribed) {
            throw new Error(`cannot add \`postgres_changes\` callbacks for realtime:${topic} after subscribing to the channel`);
          }
          return entry;
        }),
        subscribe: jest.fn(() => {
          entry.subscribed = true;
          return entry;
        }),
      };
      mockChannelRegistry.set(topic, entry);
      return entry;
    }),
    removeChannel: jest.fn(),
  },
}));

function matchFixture(overrides: Partial<RankedMatch> = {}): RankedMatch {
  return {
    id: 'match-1',
    season_id: 1,
    event_id: null,
    court_id: null,
    venue_id: null,
    match_type: 'singles',
    match_weight_type: 'air_rally_ranked',
    team_a_name: null,
    team_a_club_id: null,
    team_b_name: null,
    team_b_club_id: null,
    rated: true,
    status: 'live',
    officiating_mode: null,
    scorekeeper_id: null,
    target_score: 11,
    win_by: 2,
    score_a: 6,
    score_b: 6,
    serving_team: 'a',
    winning_team: null,
    rank_applied: false,
    dispute_reason: null,
    created_by: 'me',
    created_at: '2026-08-28T00:00:00.000Z',
    started_at: '2026-08-28T00:05:00.000Z',
    completed_at: null,
    confirmed_at: null,
    updated_at: '2026-08-28T00:05:00.000Z',
    ...overrides,
  };
}

function detailFixture(): RankedMatchDetail {
  return { ...matchFixture(), players: [], scorekeeper: null, team_a_club: null, team_b_club: null };
}

function Probe({ matchId }: { matchId: string }) {
  useRankedMatch(matchId, detailFixture());
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockChannelRegistry.clear();
});

it('two simultaneous mounts of the same match do not collide on one Realtime channel', async () => {
  // Two live instances of the same route — the exact shape of a
  // notification tap pushing a second copy of an already-open match
  // screen. Both must be able to mount without throwing.
  await render(<Probe matchId="match-1" />);
  await render(<Probe matchId="match-1" />);

  const mockChannel = supabase.channel as jest.Mock;
  const topics = mockChannel.mock.calls.map((call) => call[0]);
  expect(topics).toHaveLength(2);
  // The actual bug: two mounts asking for the identical topic. The fix
  // only holds if these are never the same string.
  expect(topics[0]).not.toEqual(topics[1]);
});
