import { listMyBookings } from '@/lib/bookings';
import { supabase } from '@/lib/supabase';

/**
 * The bookings SELECT policy is `auth.uid() = user_id or is_admin() or
 * <owns the court's venue>`. Left to RLS alone, a venue owner's
 * personal Bookings tab listed every customer booking at their venues
 * (each offering a Cancel the server then refused), and the 100-row cap
 * could push the owner's own bookings off the list entirely. Same bug
 * class as the Alerts feed — see notifications-scoped-to-user.test.tsx.
 *
 * `select` returns a builder that supports BOTH `.eq` and `.order`, so
 * the pre-fix unfiltered chain resolves cleanly here and fails on the
 * predicate assertion itself rather than on a mock shape.
 */

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const eq = jest.fn();
const order = jest.fn();
const limit = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  limit.mockResolvedValue({ data: [], error: null });
  order.mockReturnValue({ limit });
  eq.mockReturnValue({ order });
  (supabase.from as jest.Mock).mockReturnValue({ select: () => ({ eq, order }) });
});

it("filters to the signed-in user's own bookings rather than everything RLS allows", async () => {
  await listMyBookings('me');

  expect(supabase.from).toHaveBeenCalledWith('bookings');
  expect(eq).toHaveBeenCalledWith('user_id', 'me');
});
