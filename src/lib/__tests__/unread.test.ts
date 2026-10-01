import { renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { supabase } from '@/lib/supabase';
import { refreshUnreadCount, unreadBadgeLabel, useUnreadCount } from '@/lib/unread';

jest.mock('expo-notifications', () => ({ setBadgeCountAsync: jest.fn(async () => true) }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const mockFrom = supabase.from as jest.Mock;
const is = jest.fn();
const eq = jest.fn();

/** A count query that resolves when told to, so ordering can be tested. */
function countQuery(result: Promise<{ count: number | null; error: unknown }>) {
  is.mockReturnValueOnce(result);
  eq.mockReturnValueOnce({ is });
  mockFrom.mockReturnValueOnce({ select: () => ({ eq }) });
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

// The store is module state; read it through its own hook, as the tab does.
async function currentCount(): Promise<number> {
  const { result } = await renderHook(() => useUnreadCount());
  return result.current;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await refreshUnreadCount(null);
  jest.clearAllMocks();
});

it("counts only the signed-in user's unread rows, and sets the app-icon badge to match", async () => {
  countQuery(Promise.resolve({ count: 3, error: null }));
  await refreshUnreadCount('me');

  expect(mockFrom).toHaveBeenCalledWith('notifications');
  expect(eq).toHaveBeenCalledWith('user_id', 'me');
  expect(is).toHaveBeenCalledWith('read_at', null);
  expect(Notifications.setBadgeCountAsync).toHaveBeenLastCalledWith(3);
  expect(await currentCount()).toBe(3);
});

it('a slow older count cannot overwrite a newer one', async () => {
  const older = deferred<{ count: number | null; error: unknown }>();
  const newer = deferred<{ count: number | null; error: unknown }>();
  countQuery(older.promise);
  countQuery(newer.promise);

  const first = refreshUnreadCount('me'); // e.g. on foreground, before reading
  const second = refreshUnreadCount('me'); // after "Mark all read"
  newer.resolve({ count: 0, error: null });
  await second;
  older.resolve({ count: 5, error: null });
  await first;

  expect(await currentCount()).toBe(0);
  expect(Notifications.setBadgeCountAsync).toHaveBeenLastCalledWith(0);
});

it('keeps the last known count when the read fails, rather than flashing zero', async () => {
  countQuery(Promise.resolve({ count: 2, error: null }));
  await refreshUnreadCount('me');
  countQuery(Promise.resolve({ count: null, error: { message: 'Network request failed' } }));
  await refreshUnreadCount('me');

  expect(await currentCount()).toBe(2);
});

it('clears to zero, icon included, when nobody is signed in', async () => {
  countQuery(Promise.resolve({ count: 4, error: null }));
  await refreshUnreadCount('me');
  await refreshUnreadCount(null);

  expect(await currentCount()).toBe(0);
  expect(Notifications.setBadgeCountAsync).toHaveBeenLastCalledWith(0);
});

it('caps the tab label at "9+"', () => {
  expect(unreadBadgeLabel(3)).toBe('3');
  expect(unreadBadgeLabel(12)).toBe('9+');
});
