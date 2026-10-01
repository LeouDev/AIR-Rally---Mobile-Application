import { act, render } from '@testing-library/react-native';
import React from 'react';

import { useRankedMatch } from '@/hooks/use-ranked-match';
import type { RankedMatchDetail } from '@/lib/ranked';
import { getMatch } from '@/lib/ranked';
import { supabase } from '@/lib/supabase';

/**
 * Every point triggers several independent refetches of the match (a
 * Realtime event per changed table, the 5s backstop poll, the
 * scorekeeper's own refresh), and getMatch() is several sequential
 * round trips. Without ordering, whichever read FINISHED last won — so
 * on a slow connection an older read could land after a newer one and
 * the score rolled back a point on every phone in the room.
 */

jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getMatch: jest.fn(),
}));

jest.mock('@/lib/supabase', () => {
  const channel = { on: jest.fn(), subscribe: jest.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return { supabase: { channel: jest.fn(() => channel), removeChannel: jest.fn() } };
});

const mockGetMatch = getMatch as jest.MockedFunction<typeof getMatch>;

function detail(scoreA: number): RankedMatchDetail {
  return { id: 'match-1', status: 'live', score_a: scoreA, score_b: 4 } as unknown as RankedMatchDetail;
}

function deferred() {
  let resolve: (value: RankedMatchDetail | null) => void = () => {};
  const promise = new Promise<RankedMatchDetail | null>((r) => (resolve = r));
  return { promise, resolve };
}

it('a slow older read cannot roll the score back over a newer one', async () => {
  const older = deferred();
  const newer = deferred();
  mockGetMatch.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

  let seen: RankedMatchDetail | undefined;
  function Probe() {
    [seen] = useRankedMatch('match-1', detail(5));
    return null;
  }
  await render(<Probe />); // mount → read #1

  // A point lands and Realtime fires → read #2.
  const channel = (supabase.channel as jest.Mock).mock.results[0].value;
  const onRowChange = channel.on.mock.calls[0][2] as () => void;
  await act(async () => {
    onRowChange();
  });

  await act(async () => {
    newer.resolve(detail(7));
  });
  await act(async () => {
    older.resolve(detail(6));
  });

  expect(seen?.score_a).toBe(7);
});
