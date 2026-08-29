import { getActiveMatchForEvent, myMatchResult, opponentNames, type RankedMatchParticipant } from '@/lib/ranked';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

const mockFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;

function participant(overrides: Partial<RankedMatchParticipant>): RankedMatchParticipant {
  return {
    match_id: 'match-1',
    user_id: 'me-1',
    team: 'a',
    is_host: true,
    mode: 'singles',
    ready: true,
    ready_at: null,
    officiating_vote: true,
    result_response: 'accepted',
    dispute_reason: null,
    rating_before: null,
    rating_after: null,
    rating_delta: null,
    tier_before: null,
    pips_before: null,
    tier_after: null,
    pips_after: null,
    pip_delta: null,
    star_protected: false,
    expected_score: null,
    actual_score: null,
    performance_gap: null,
    match_weight: null,
    recency_multiplier: null,
    reliability_modifier: null,
    rating_discounted: false,
    created_at: '2026-08-21T10:00:00.000Z',
    profile: { id: 'me-1', display_name: 'Galileouuu', avatar_url: null },
    rank: null,
    ...overrides,
  };
}

describe('myMatchResult', () => {
  it('reads a win with a tier promotion from the winner\'s own side', () => {
    const me = participant({
      team: 'a',
      tier_before: 4,
      pips_before: 5,
      tier_after: 5,
      pips_after: 1,
      rating_before: 1185,
      rating_after: 1212,
      rating_delta: 27,
    });
    const opponent = participant({ user_id: 'opp-1', team: 'b' });

    const result = myMatchResult({ winning_team: 'a', score_a: 11, score_b: 9 }, [me, opponent], 'me-1');

    expect(result).toEqual({
      me,
      won: true,
      myScore: 11,
      theirScore: 9,
      justPlaced: false,
      promoted: true,
      demoted: false,
    });
  });

  it('reads a loss from the losing side, scores flipped relative to team a/b', () => {
    const me = participant({ user_id: 'me-1', team: 'b' });
    const opponent = participant({ user_id: 'opp-1', team: 'a' });

    const result = myMatchResult({ winning_team: 'a', score_a: 11, score_b: 6 }, [me, opponent], 'me-1');

    expect(result?.won).toBe(false);
    expect(result?.myScore).toBe(6);
    expect(result?.theirScore).toBe(11);
  });

  it('treats a null tier_before as a calibration placement, not a promotion', () => {
    const me = participant({ tier_before: null, pips_before: null, tier_after: 2, pips_after: 3 });

    const result = myMatchResult({ winning_team: 'a', score_a: 11, score_b: 6 }, [me], 'me-1');

    expect(result?.justPlaced).toBe(true);
    expect(result?.promoted).toBe(false);
    expect(result?.demoted).toBe(false);
  });

  it('flags a demotion when tier_after drops below tier_before', () => {
    const me = participant({ tier_before: 3, pips_before: 1, tier_after: 2, pips_after: 5 });

    const result = myMatchResult({ winning_team: 'b', score_a: 6, score_b: 11 }, [me], 'me-1');

    expect(result?.promoted).toBe(false);
    expect(result?.demoted).toBe(true);
  });

  it('returns null when the given user is not one of the match players', () => {
    const opponent = participant({ user_id: 'opp-1' });

    const result = myMatchResult({ winning_team: 'a', score_a: 11, score_b: 9 }, [opponent], 'someone-else');

    expect(result).toBeNull();
  });
});

describe('getActiveMatchForEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockChain(result: { data: unknown; error: unknown }) {
    const limit = jest.fn(async () => result);
    const order = jest.fn(() => ({ limit }));
    const inFn = jest.fn(() => ({ order }));
    const eq = jest.fn(() => ({ in: inFn }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ select } as never);
    return { select, eq, inFn, order, limit };
  }

  it("scopes to this event's own active match — not just any match with this event_id in its history", async () => {
    const { select, eq, inFn } = mockChain({ data: [{ id: 'match-1', status: 'live' }], error: null });

    const match = await getActiveMatchForEvent('event-1');

    expect(select).toHaveBeenCalledWith('id, status');
    expect(eq).toHaveBeenCalledWith('event_id', 'event-1');
    expect(inFn).toHaveBeenCalledWith('status', ['lobby', 'officiating', 'live', 'awaiting_confirmation']);
    expect(match).toEqual({ id: 'match-1', status: 'live' });
  });

  it('returns null rather than a stale link when the only matches for this event have all finished', async () => {
    mockChain({ data: [], error: null });

    await expect(getActiveMatchForEvent('event-1')).resolves.toBeNull();
  });

  it('propagates a query failure rather than silently offering to start a duplicate match', async () => {
    mockChain({ data: null, error: { code: '08006', message: 'connection lost' } });

    await expect(getActiveMatchForEvent('event-1')).rejects.toBeTruthy();
  });
});

describe('opponentNames', () => {
  it('names the single opponent in singles', () => {
    const me = participant({ team: 'a' });
    const opponent = participant({ user_id: 'opp-1', team: 'b', profile: { id: 'opp-1', display_name: 'Ungart', avatar_url: null } });

    expect(opponentNames([me, opponent], me)).toBe('Ungart');
  });

  it('"&"-joins both opponents in doubles', () => {
    const me = participant({ team: 'a' });
    const partner = participant({ user_id: 'partner-1', team: 'a' });
    const opp1 = participant({ user_id: 'opp-1', team: 'b', profile: { id: 'opp-1', display_name: 'Ungart', avatar_url: null } });
    const opp2 = participant({ user_id: 'opp-2', team: 'b', profile: { id: 'opp-2', display_name: 'Kim', avatar_url: null } });

    expect(opponentNames([me, partner, opp1, opp2], me)).toBe('Ungart & Kim');
  });

  it('falls back to "a player" when an opponent has no profile', () => {
    const me = participant({ team: 'a' });
    const opponent = participant({ user_id: 'opp-1', team: 'b', profile: null });

    expect(opponentNames([me, opponent], me)).toBe('a player');
  });
});
