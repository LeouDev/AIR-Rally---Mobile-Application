import { createRankedMatch, isMatchBooked } from '@/lib/ranked';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const mockRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createRankedMatch — p_rated threading', () => {
  it('defaults to rated:true when omitted, matching every call site before this field existed', async () => {
    mockRpc.mockResolvedValue({ data: 'match-1', error: null } as never);

    await createRankedMatch({ matchType: 'singles', teamA: ['a'], teamB: ['b'] });

    expect(mockRpc).toHaveBeenCalledWith(
      'create_ranked_match',
      expect.objectContaining({ p_rated: true })
    );
  });

  it('sends rated:false through untouched when the doorway asks for casual', async () => {
    mockRpc.mockResolvedValue({ data: 'match-1', error: null } as never);

    await createRankedMatch({ matchType: 'doubles', teamA: ['a', 'b'], teamB: ['c', 'd'], rated: false });

    expect(mockRpc).toHaveBeenCalledWith(
      'create_ranked_match',
      expect.objectContaining({ p_rated: false })
    );
  });
});

describe('isMatchBooked', () => {
  it('calls the server\'s own predicate rather than deriving bookedness client-side', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null } as never);

    await expect(isMatchBooked('match-1')).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('ranked_match_is_booked', { p_match_id: 'match-1' });
  });

  it('treats a null response as not booked rather than throwing', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as never);

    await expect(isMatchBooked('match-1')).resolves.toBe(false);
  });

  it('propagates a real query failure rather than reporting "not booked"', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network down' } } as never);

    await expect(isMatchBooked('match-1')).rejects.toBeTruthy();
  });
});
