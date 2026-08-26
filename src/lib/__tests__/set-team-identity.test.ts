import { RankedError, setTeamIdentity } from '@/lib/ranked';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const mockRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('setTeamIdentity', () => {
  it('sends only p_name for a custom name — p_club_id stays null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as never);

    await setTeamIdentity('match-1', 'a', { name: 'The Smashers' });

    expect(mockRpc).toHaveBeenCalledWith('set_ranked_team_identity', {
      p_match_id: 'match-1',
      p_team: 'a',
      p_name: 'The Smashers',
      p_club_id: null,
    });
  });

  it('sends only p_club_id for a club choice — p_name stays null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as never);

    await setTeamIdentity('match-1', 'b', { clubId: 'club-1' });

    expect(mockRpc).toHaveBeenCalledWith('set_ranked_team_identity', {
      p_match_id: 'match-1',
      p_team: 'b',
      p_name: null,
      p_club_id: 'club-1',
    });
  });

  it('sends both null to clear an identity', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as never);

    await setTeamIdentity('match-1', 'a', null);

    expect(mockRpc).toHaveBeenCalledWith('set_ranked_team_identity', {
      p_match_id: 'match-1',
      p_team: 'a',
      p_name: null,
      p_club_id: null,
    });
  });

  it('surfaces an AR001 rule as a RankedError with the server\'s own message', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'AR001', message: 'You are not a member of that club.' },
    } as never);

    await expect(setTeamIdentity('match-1', 'a', { clubId: 'club-1' })).rejects.toMatchObject({
      message: 'You are not a member of that club.',
    });
    await expect(setTeamIdentity('match-1', 'a', { clubId: 'club-1' })).rejects.toBeInstanceOf(RankedError);
  });

  it('propagates a non-rule failure without wrapping it', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection lost' } } as never);

    await expect(setTeamIdentity('match-1', 'a', { name: 'x' })).rejects.not.toBeInstanceOf(RankedError);
  });
});
