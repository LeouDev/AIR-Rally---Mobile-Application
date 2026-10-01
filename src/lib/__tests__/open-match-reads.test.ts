import { getMyJoinRequest, listJoinedPlayers, listOpenMatchesForCity } from '@/lib/open-match';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

type Row = Record<string, unknown>;

/** Just enough of a PostgREST table to tell the queries apart: filters
 * chain, `order`/`limit` really shape the rows, and `maybeSingle` errors
 * on more than one row exactly as PostgREST does (PGRST116). */
function table(rows: Row[]) {
  let result = rows;
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    order: (column: string, { ascending }: { ascending: boolean }) => {
      result = [...result].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
      return query;
    },
    limit: (n: number) => {
      result = result.slice(0, n);
      return query;
    },
    maybeSingle: async () =>
      result.length > 1
        ? { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
        : { data: result[0] ?? null, error: null },
    then: (resolve: (value: unknown) => unknown) => resolve({ data: result, error: null }),
  };
  return query;
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("names every game's host, not just the viewer's own", async () => {
  // profiles' RLS is own-row-only, so a profiles embed came back null for
  // everyone else's game ("A player's game"). public_profiles is readable.
  mockFrom.mockImplementation((name: string) =>
    name === 'open_matches'
      ? table([{ id: 'om-1', host_id: 'host-1', target_city: 'mandaue', status: 'open', created_at: '2026-09-01' }])
      : table([{ id: 'host-1', display_name: 'Robin', avatar_url: null }])
  );
  mockRpc.mockResolvedValue({ data: 2, error: null });

  const [game] = await listOpenMatchesForCity('mandaue');

  expect(game.host?.display_name).toBe('Robin');
  expect(mockFrom).toHaveBeenCalledWith('public_profiles');
});

it('reads the newest request when the player joined, left and joined again', async () => {
  // No unique (open_match_id, user_id) by design, so this player has two
  // rows. A bare maybeSingle() raised PGRST116 and stranded the sheet on
  // "Couldn't load your request status" with no Leave button.
  mockFrom.mockReturnValue(
    table([
      { id: 'req-1', status: 'withdrawn', created_at: '2026-09-01T10:00:00Z' },
      { id: 'req-2', status: 'accepted', created_at: '2026-09-01T10:05:00Z' },
    ])
  );

  const request = await getMyJoinRequest('om-1', 'me');

  expect(request).toMatchObject({ id: 'req-2', status: 'accepted' });
});

it("lists who joined the host's game by name, through public_profiles", async () => {
  mockFrom.mockImplementation((name: string) =>
    name === 'open_match_join_requests'
      ? table([{ id: 'req-1', user_id: 'robin', status: 'accepted', created_at: '2026-09-01T10:00:00Z' }])
      : table([{ id: 'robin', display_name: 'Robin', avatar_url: null }])
  );

  const players = await listJoinedPlayers('om-1');

  expect(players).toEqual([{ requestId: 'req-1', profile: { id: 'robin', display_name: 'Robin', avatar_url: null } }]);
  expect(mockFrom).toHaveBeenCalledWith('public_profiles');
});
