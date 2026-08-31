import { createOpenMatch } from '@/lib/open-match';
import { supabase } from '@/lib/supabase';

/**
 * Migration 119's own guard rejects p_scheduled_at <= now() with 'Pick
 * a time in the future.', computed server-side — so a "post right now"
 * tap that builds `new Date()` client-side can lose the race to network
 * latency and land in the past by the time the request arrives. Backend
 * flagged this as the client's problem to solve, not something the
 * server guard should loosen for. createOpenMatch() pushes an imminent
 * timestamp forward by a small buffer; a real future schedule (days out)
 * must pass through completely unchanged.
 */

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const mockRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('sends a real future schedule unchanged', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-08-31T12:00:00.000Z').getTime());
  mockRpc.mockResolvedValue({ data: 'open-1', error: null } as never);

  const saturday = new Date('2026-09-05T17:00:00.000Z');
  await createOpenMatch('mandaue', saturday);

  expect(mockRpc).toHaveBeenCalledWith('create_open_match', {
    p_city_slug: 'mandaue',
    p_scheduled_at: saturday.toISOString(),
    p_venue_id: null,
    p_venue_label: null,
  });
});

it('pushes a literal "now" timestamp forward so it never loses the race to the server-side clock', async () => {
  const nowMs = new Date('2026-08-31T12:00:00.000Z').getTime();
  jest.spyOn(Date, 'now').mockReturnValue(nowMs);
  mockRpc.mockResolvedValue({ data: 'open-1', error: null } as never);

  await createOpenMatch('mandaue', new Date(nowMs));

  const sentParams = mockRpc.mock.calls[0][1] as unknown as { p_scheduled_at: string };
  expect(new Date(sentParams.p_scheduled_at).getTime()).toBeGreaterThan(nowMs);
});

it('pushes an already-past timestamp forward rather than sending it as-is', async () => {
  const nowMs = new Date('2026-08-31T12:00:00.000Z').getTime();
  jest.spyOn(Date, 'now').mockReturnValue(nowMs);
  mockRpc.mockResolvedValue({ data: 'open-1', error: null } as never);

  await createOpenMatch('mandaue', new Date(nowMs - 60000));

  const sentParams = mockRpc.mock.calls[0][1] as unknown as { p_scheduled_at: string };
  expect(new Date(sentParams.p_scheduled_at).getTime()).toBeGreaterThan(nowMs);
});

it('passes a listed venue id through, label left null', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-08-31T12:00:00.000Z').getTime());
  mockRpc.mockResolvedValue({ data: 'open-1', error: null } as never);

  const saturday = new Date('2026-09-05T17:00:00.000Z');
  await createOpenMatch('mandaue', saturday, { id: 'venue-1' });

  expect(mockRpc).toHaveBeenCalledWith(
    'create_open_match',
    expect.objectContaining({ p_venue_id: 'venue-1', p_venue_label: null })
  );
});

it('passes a free-text venue label through, id left null', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-08-31T12:00:00.000Z').getTime());
  mockRpc.mockResolvedValue({ data: 'open-1', error: null } as never);

  const saturday = new Date('2026-09-05T17:00:00.000Z');
  await createOpenMatch('mandaue', saturday, { label: 'Nomads Pickleball' });

  expect(mockRpc).toHaveBeenCalledWith(
    'create_open_match',
    expect.objectContaining({ p_venue_id: null, p_venue_label: 'Nomads Pickleball' })
  );
});
