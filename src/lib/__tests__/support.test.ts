import { createSupportRequest, listMySupportRequests, SupportError } from '@/lib/support';
import { supabase } from '@/lib/supabase';

/**
 * Someone contacting support is already having a bad time. A request
 * that appears to send and silently doesn't is the worst version of
 * this screen, so the failure paths carry as much weight here as the
 * happy one.
 *
 * The rate-limit trigger raises check_violation (23514) — the SAME code
 * as every ordinary CHECK on this table (category, subject length,
 * message length). Matching on the code would tell someone with an
 * over-long subject that they'd messaged too much today. That
 * misclassification is what these pin against.
 */

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const mockFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;

function mockInsert(result: { data: unknown; error: unknown }) {
  const single = jest.fn(async () => result);
  const select = jest.fn(() => ({ single }));
  // Declares the row param so the assertion below can read it —
  // jest.fn(() => ...) infers a zero-arg tuple.
  const insert = jest.fn((_row: Record<string, unknown>) => ({ select }));
  mockFrom.mockReturnValue({ insert } as never);
  return { insert, select, single };
}

const ROW = {
  id: 'req-1',
  user_id: 'me',
  category: 'booking',
  subject: 'Charged twice',
  message: 'I was charged twice for the same booking on Tuesday.',
  status: 'open',
  resolved_by: null,
  resolved_at: null,
  resolution_note: null,
  created_at: '2026-08-24T00:00:00.000Z',
  updated_at: '2026-08-24T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createSupportRequest', () => {
  it('sends the category alongside subject and message — the column is NOT NULL', async () => {
    const { insert } = mockInsert({ data: ROW, error: null });

    await createSupportRequest('me', {
      category: 'payment',
      subject: 'Charged twice',
      message: 'I was charged twice for the same booking on Tuesday.',
    });

    expect(insert).toHaveBeenCalledWith({
      user_id: 'me',
      category: 'payment',
      subject: 'Charged twice',
      message: 'I was charged twice for the same booking on Tuesday.',
    });
  });

  it('trims before sending, so trailing whitespace never counts toward the length CHECK', async () => {
    const { insert } = mockInsert({ data: ROW, error: null });

    await createSupportRequest('me', {
      category: 'bug',
      subject: '  Padded subject  ',
      message: '  A message with more than twenty characters.  ',
    });

    const arg = insert.mock.calls[0][0] as { subject: string; message: string };
    expect(arg.subject).toBe('Padded subject');
    expect(arg.message).toBe('A message with more than twenty characters.');
  });

  it('reports the rate limit as a rate limit, using the message text not the code', async () => {
    mockInsert({
      data: null,
      error: { code: '23514', message: 'rate limit reached: at most 5 per 1 day for support' },
    });

    await expect(
      createSupportRequest('me', { category: 'other', subject: 'Hi', message: 'A message of sufficient length.' })
    ).rejects.toBeInstanceOf(SupportError);
  });

  it('does NOT call an ordinary CHECK violation a rate limit — same code, different cause', async () => {
    // A too-long subject raises 23514 too. Reporting that as "you've
    // messaged us a lot today" would send someone away for a day over a
    // fixable typo.
    mockInsert({
      data: null,
      error: { code: '23514', message: 'new row violates check constraint "support_requests_subject_check"' },
    });

    const err = await createSupportRequest('me', {
      category: 'other',
      subject: 'x'.repeat(500),
      message: 'A message of sufficient length.',
    }).catch((e) => e);

    expect(err).not.toBeInstanceOf(SupportError);
    expect(err).toBeTruthy();
  });

  it('throws rather than resolving when the insert returns no row — never "sent" without proof', async () => {
    mockInsert({ data: null, error: null });

    await expect(
      createSupportRequest('me', { category: 'other', subject: 'Hi', message: 'A message of sufficient length.' })
    ).rejects.toBeTruthy();
  });

  it('propagates an ordinary failure rather than swallowing it', async () => {
    mockInsert({ data: null, error: { code: '08006', message: 'connection lost' } });

    await expect(
      createSupportRequest('me', { category: 'other', subject: 'Hi', message: 'A message of sufficient length.' })
    ).rejects.toBeTruthy();
  });
});

describe('listMySupportRequests', () => {
  function mockList(result: { data: unknown; error: unknown }) {
    const limit = jest.fn(async () => result);
    const order = jest.fn(() => ({ limit }));
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ select } as never);
    return { select, eq, order, limit };
  }

  it('scopes to the caller and returns newest first', async () => {
    const { eq, order } = mockList({ data: [ROW], error: null });

    await expect(listMySupportRequests('me')).resolves.toEqual([ROW]);
    expect(eq).toHaveBeenCalledWith('user_id', 'me');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns an empty list rather than throwing when there is nothing yet', async () => {
    mockList({ data: null, error: null });

    await expect(listMySupportRequests('me')).resolves.toEqual([]);
  });

  it('propagates a query failure — an empty list would be a lie about the history', async () => {
    mockList({ data: null, error: { code: '08006', message: 'connection lost' } });

    await expect(listMySupportRequests('me')).rejects.toBeTruthy();
  });
});
