import { listFeedPosts } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

/**
 * court_side_feed()'s scope argument is required with no default (web
 * repo migration 20260810000077_court_side_feed_scope.sql) — the RPC
 * itself will reject a call missing it. This pins that the client always
 * sends p_scope, always sends the composite cursor as a matched pair
 * (never just effective_at), and reads the same pair back out of the
 * last row for the next page.
 */

jest.mock('@/lib/events', () => ({ listEmbeddedEvents: jest.fn(async () => new Map()) }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(() => ({
      select: () => ({ in: async () => ({ data: [], error: null }) }),
    })),
  },
}));

const mockRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

const ROW = {
  id: 'post-1',
  user_id: 'author-1',
  content: 'hello',
  image_url: null,
  image_paths: [],
  event_id: null,
  club_id: null,
  like_count: 0,
  comment_count: 0,
  reshare_count: 0,
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
  effective_at: '2026-08-20T00:00:00.000Z',
  resharer_id: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listFeedPosts scope and cursor wiring', () => {
  it('always sends p_scope — never the omission that shipped the original bug', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null } as never);

    await listFeedPosts({ scope: 'following' });

    expect(mockRpc).toHaveBeenCalledWith('court_side_feed', expect.objectContaining({ p_scope: 'following' }));
  });

  it('sends the cursor as a matched pair, not effective_at alone', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null } as never);

    await listFeedPosts({ scope: 'for_you', cursor: { effectiveAt: '2026-08-20T00:00:00.000Z', id: 'post-9' } });

    expect(mockRpc).toHaveBeenCalledWith(
      'court_side_feed',
      expect.objectContaining({ p_cursor: '2026-08-20T00:00:00.000Z', p_cursor_id: 'post-9' })
    );
  });

  it('omits both cursor fields together on a first page, never just one', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null } as never);

    await listFeedPosts({ scope: 'for_you' });

    const [, args] = mockRpc.mock.calls[0];
    expect(args).toMatchObject({ p_cursor: undefined, p_cursor_id: undefined });
  });

  it('reads the next cursor back as a pair from the last row, not effective_at alone', async () => {
    mockRpc.mockResolvedValue({ data: [{ ...ROW, id: 'post-1' }], error: null } as never);

    const { nextCursor } = await listFeedPosts({ scope: 'for_you', limit: 1 });

    expect(nextCursor).toEqual({ effectiveAt: ROW.effective_at, id: 'post-1' });
  });

  it('reports no next page once a page comes back short of the limit', async () => {
    mockRpc.mockResolvedValue({ data: [ROW], error: null } as never);

    const { nextCursor } = await listFeedPosts({ scope: 'for_you', limit: 20 });

    expect(nextCursor).toBeNull();
  });
});
