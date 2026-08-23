import { blockUser, listMyBlocks, unblockUser } from '@/lib/blocks';
import { supabase } from '@/lib/supabase';

/**
 * A block or unblock that silently fails is the same shape as
 * everything else tonight: someone believes they're protected and
 * they're not, or believes they've unblocked someone and haven't. So
 * the failure paths get equal weight to the happy path here.
 */

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

const mockFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;
const mockRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('blockUser', () => {
  it('inserts the block as the caller, targeting the right person', async () => {
    const insert = jest.fn(async () => ({ error: null }));
    mockFrom.mockReturnValue({ insert } as never);

    await blockUser('me', 'them');

    expect(insert).toHaveBeenCalledWith({ blocker_id: 'me', blocked_id: 'them' });
  });

  it('treats blocking someone already blocked as success, not an error', async () => {
    const insert = jest.fn(async () => ({ error: { code: '23505', message: 'duplicate key' } }));
    mockFrom.mockReturnValue({ insert } as never);

    await expect(blockUser('me', 'them')).resolves.toBeUndefined();
  });

  it('propagates any other failure — this must never look like it succeeded', async () => {
    const insert = jest.fn(async () => ({ error: { code: '42501', message: 'row-level security' } }));
    mockFrom.mockReturnValue({ insert } as never);

    await expect(blockUser('me', 'them')).rejects.toBeTruthy();
  });
});

describe('unblockUser', () => {
  it('deletes scoped to both the caller and the specific target', async () => {
    const eq2 = jest.fn(async () => ({ error: null }));
    const eq1 = jest.fn(() => ({ eq: eq2 }));
    const del = jest.fn(() => ({ eq: eq1 }));
    mockFrom.mockReturnValue({ delete: del } as never);

    await unblockUser('me', 'them');

    expect(eq1).toHaveBeenCalledWith('blocker_id', 'me');
    expect(eq2).toHaveBeenCalledWith('blocked_id', 'them');
  });

  it('propagates a delete failure rather than reporting success', async () => {
    const eq2 = jest.fn(async () => ({ error: { code: '08006', message: 'connection lost' } }));
    const eq1 = jest.fn(() => ({ eq: eq2 }));
    const del = jest.fn(() => ({ eq: eq1 }));
    mockFrom.mockReturnValue({ delete: del } as never);

    await expect(unblockUser('me', 'them')).rejects.toBeTruthy();
  });
});

describe('listMyBlocks', () => {
  it('returns the rows list_my_blocks() gives back', async () => {
    const rows = [{ blocked_id: 'a', display_name: 'A', avatar_url: null, created_at: '2026-01-01' }];
    mockRpc.mockResolvedValue({ data: rows, error: null } as never);

    await expect(listMyBlocks()).resolves.toEqual(rows);
  });

  it('returns an empty list rather than throwing when there is nothing to list', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as never);

    await expect(listMyBlocks()).resolves.toEqual([]);
  });

  it('throws on a real failure rather than silently returning an empty list', async () => {
    // Distinct from the "nothing blocked yet" case above: an empty
    // result and a FAILED read must never look the same to the caller,
    // or a broken load reads as "you haven't blocked anyone."
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } } as never);

    await expect(listMyBlocks()).rejects.toBeTruthy();
  });
});
