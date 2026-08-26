import {
  createVenueRequest,
  DuplicateVenueRequestError,
  getMyVenueRequestDemand,
  getVenueRequestSuggestions,
} from '@/lib/venue-requests';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

const mockFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;
const mockRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createVenueRequest', () => {
  it('inserts as the caller, with the optional fields defaulted to null', async () => {
    const single = jest.fn(async () => ({ data: { id: 'req-1' }, error: null }));
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    mockFrom.mockReturnValue({ insert } as never);

    await createVenueRequest('user-1', { placeName: 'Court X' });

    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      place_name: 'Court X',
      place_city: null,
      note: null,
    });
  });

  it('maps a unique-constraint hit to a friendly, named error rather than a raw Postgres one', async () => {
    const single = jest.fn(async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }));
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    mockFrom.mockReturnValue({ insert } as never);

    await expect(createVenueRequest('user-1', { placeName: 'Court X' })).rejects.toBeInstanceOf(
      DuplicateVenueRequestError
    );
  });

  it('propagates any other failure as-is, not as DuplicateVenueRequestError', async () => {
    // A 42501 (RLS denial) must read as a real failure, not the friendly
    // "you already asked" message — those are two different problems.
    const single = jest.fn(async () => ({ data: null, error: { code: '42501', message: 'denied' } }));
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    mockFrom.mockReturnValue({ insert } as never);

    await expect(createVenueRequest('user-1', { placeName: 'Court X' })).rejects.not.toBeInstanceOf(
      DuplicateVenueRequestError
    );
  });
});

describe('getVenueRequestSuggestions', () => {
  it('returns nothing for a query under two characters, without calling the network at all', async () => {
    await expect(getVenueRequestSuggestions('a')).resolves.toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('maps snake_case rows to the camelCase shape callers use', async () => {
    mockRpc.mockResolvedValue({
      data: [{ place_name: 'Court X', place_city: 'Manila' }],
      error: null,
    } as never);

    await expect(getVenueRequestSuggestions('Court')).resolves.toEqual([{ placeName: 'Court X', placeCity: 'Manila' }]);
    expect(mockRpc).toHaveBeenCalledWith('venue_request_place_suggestions', { p_query: 'Court' });
  });

  it('throws on a real failure rather than returning an empty list', async () => {
    // Distinct from "nothing suggested" above — a broken lookup must not
    // silently read as "no other player has asked for anything like this."
    mockRpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection lost' } } as never);

    await expect(getVenueRequestSuggestions('Court')).rejects.toBeTruthy();
  });
});

describe('getMyVenueRequestDemand', () => {
  it('returns the promise, not a number, below the threshold of 5', async () => {
    const single = jest.fn(async () => ({ data: { requesters: 2, show_count: false }, error: null }));
    mockRpc.mockReturnValue({ single } as never);

    await expect(getMyVenueRequestDemand('req-1')).resolves.toEqual({ requesters: 2, showCount: false });
  });

  it('shows the count once it reaches the threshold', async () => {
    const single = jest.fn(async () => ({ data: { requesters: 5, show_count: true }, error: null }));
    mockRpc.mockReturnValue({ single } as never);

    await expect(getMyVenueRequestDemand('req-1')).resolves.toEqual({ requesters: 5, showCount: true });
  });

  it('throws rather than silently returning zero demand for a request the caller does not own', async () => {
    const single = jest.fn(async () => ({ data: null, error: { code: 'P0002', message: 'No such request.' } }));
    mockRpc.mockReturnValue({ single } as never);

    await expect(getMyVenueRequestDemand('someone-elses-request')).rejects.toBeTruthy();
  });
});
