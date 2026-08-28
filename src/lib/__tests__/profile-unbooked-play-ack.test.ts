import { acknowledgeUnbookedPlay, getUnbookedPlayAcknowledged } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

/**
 * `unbooked_play_ack_at` gates whether a calibrated player sees the
 * Play doorway's rating-freeze confirmation again or not — see
 * app/ranked/play.tsx's confirmBeforeUnbookedMatch(). Read failures
 * must default to "not acknowledged" (worst case: one extra dialog),
 * and write failures must never throw or reject (the caller resolves
 * the pending match on the tap alone, before this write even starts —
 * see the CTO's explicit flag: "don't let a preference write sit in
 * the path of playing").
 */

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

const mockFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getUnbookedPlayAcknowledged', () => {
  it('is true once unbooked_play_ack_at carries a timestamp', async () => {
    const single = jest.fn(async () => ({ data: { unbooked_play_ack_at: '2026-08-29T00:00:00.000Z' }, error: null }));
    const eq = jest.fn(() => ({ single }));
    mockFrom.mockReturnValue({ select: jest.fn(() => ({ eq })) } as never);

    await expect(getUnbookedPlayAcknowledged('me')).resolves.toBe(true);
    expect(eq).toHaveBeenCalledWith('id', 'me');
  });

  it('is false while unbooked_play_ack_at is still null', async () => {
    const single = jest.fn(async () => ({ data: { unbooked_play_ack_at: null }, error: null }));
    mockFrom.mockReturnValue({ select: jest.fn(() => ({ eq: jest.fn(() => ({ single })) })) } as never);

    await expect(getUnbookedPlayAcknowledged('me')).resolves.toBe(false);
  });

  it('defaults to false on a read failure — costs an extra dialog, never a skipped one', async () => {
    const single = jest.fn(async () => ({ data: null, error: { code: '08006', message: 'connection lost' } }));
    mockFrom.mockReturnValue({ select: jest.fn(() => ({ eq: jest.fn(() => ({ single })) })) } as never);

    await expect(getUnbookedPlayAcknowledged('me')).resolves.toBe(false);
  });
});

describe('acknowledgeUnbookedPlay', () => {
  it('writes an ISO timestamp scoped to the caller', async () => {
    const eq = jest.fn(async () => ({ error: null }));
    const update = jest.fn((_values: { unbooked_play_ack_at: string }) => ({ eq }));
    mockFrom.mockReturnValue({ update } as never);

    await acknowledgeUnbookedPlay('me');

    expect(update).toHaveBeenCalledWith({ unbooked_play_ack_at: expect.any(String) });
    expect(new Date(update.mock.calls[0][0].unbooked_play_ack_at).toString()).not.toBe('Invalid Date');
    expect(eq).toHaveBeenCalledWith('id', 'me');
  });

  it('never rejects when the write itself reports a Postgres error', async () => {
    const eq = jest.fn(async () => ({ error: { code: '42501', message: 'row-level security' } }));
    mockFrom.mockReturnValue({ update: jest.fn(() => ({ eq })) } as never);

    await expect(acknowledgeUnbookedPlay('me')).resolves.toBeUndefined();
  });

  it('never rejects even when the request itself throws (network failure)', async () => {
    const eq = jest.fn(() => {
      throw new Error('network down');
    });
    mockFrom.mockReturnValue({ update: jest.fn(() => ({ eq })) } as never);

    await expect(acknowledgeUnbookedPlay('me')).resolves.toBeUndefined();
  });
});
