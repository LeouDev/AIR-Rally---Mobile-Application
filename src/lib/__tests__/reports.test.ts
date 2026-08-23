import { createReport, ReportError } from '@/lib/reports';
import { supabase } from '@/lib/supabase';

/**
 * The failure paths are the point of this file.
 *
 * A report that silently fails is worse than no report button at all:
 * the person filing it is, at that moment, having the worst experience
 * this app can give them, and a tap that appears to succeed leaves them
 * believing they have been heard when nothing was written. So every way
 * this can fail is pinned, and the success case gets one test.
 */

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

const mockFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;

/** PostgREST's insert().select().single() chain, resolving to whatever
 * the database would have returned. */
function mockInsertResult(result: { data: unknown; error: unknown }) {
  const single = jest.fn(async () => result);
  const select = jest.fn(() => ({ single }));
  const insert = jest.fn(() => ({ select }));
  mockFrom.mockReturnValue({ insert } as never);
  return { insert, select, single };
}

const INPUT = {
  targetType: 'post' as const,
  targetId: '11111111-1111-1111-1111-111111111111',
  reason: 'harassment' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createReport — failure paths', () => {
  it('names the duplicate case instead of failing generically', async () => {
    mockInsertResult({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "reports_one_open_per_reporter_target"' },
    });

    await expect(createReport('reporter-1', INPUT)).rejects.toThrow(ReportError);
    await expect(createReport('reporter-1', INPUT)).rejects.toMatchObject({ reason: 'already_reported' });
  });

  it('names the rate limit, and never leaks the raw trigger message', async () => {
    mockInsertResult({
      data: null,
      error: { code: '23514', message: 'rate limit reached: at most 20 per 1 day for report' },
    });

    const caught = await createReport('reporter-1', INPUT).catch((e) => e);
    expect(caught).toBeInstanceOf(ReportError);
    expect(caught.reason).toBe('rate_limited');
    expect(caught.message).not.toContain('rate limit reached:');
    expect(caught.message).not.toContain('at most 20');
  });

  it('does not mistake an ordinary check violation for the rate limit', async () => {
    // The rate-limit trigger raises check_violation, which is ALSO the
    // code for target_type/reason/details constraints. Matching on the
    // code alone would tell someone with a malformed reason that they
    // had filed too many reports today.
    mockInsertResult({
      data: null,
      error: { code: '23514', message: 'new row for relation "reports" violates check constraint "reports_reason_check"' },
    });

    const caught = await createReport('reporter-1', INPUT).catch((e) => e);
    expect(caught).not.toBeInstanceOf(ReportError);
  });

  it('throws — never resolves — when the row could not be written', async () => {
    mockInsertResult({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } });

    // The critical property: a caller awaiting this cannot fall through
    // to a success path. If this ever resolved, the sheet would close on
    // an unwritten report.
    await expect(createReport('reporter-1', INPUT)).rejects.toBeTruthy();
  });

  it('throws when the insert reports no error but returns no row', async () => {
    // Belt and braces: "no error" is not the same claim as "a row
    // exists", and only the second one means the report was filed.
    mockInsertResult({ data: null, error: null });

    await expect(createReport('reporter-1', INPUT)).rejects.toBeTruthy();
  });
});

describe('createReport — success', () => {
  it('returns the written row and sends the reporter as themselves', async () => {
    const row = { id: 'r1', reporter_id: 'reporter-1', target_type: 'post', reason: 'harassment' };
    const { insert } = mockInsertResult({ data: row, error: null });

    await expect(createReport('reporter-1', INPUT)).resolves.toEqual(row);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ reporter_id: 'reporter-1', target_type: 'post', reason: 'harassment' })
    );
  });

  it('normalises empty details to null rather than an empty string', async () => {
    const { insert } = mockInsertResult({ data: { id: 'r1' }, error: null });

    await createReport('reporter-1', { ...INPUT, details: '   ' });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ details: null }));
  });
});
