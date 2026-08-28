import { render, waitFor } from '@testing-library/react-native';
import React from 'react';

import NotificationsScreen from '@/app/(tabs)/notifications';
import { supabase } from '@/lib/supabase';

/**
 * The Alerts feed must be scoped IN THE QUERY, not left to RLS.
 *
 * The notifications SELECT policy is `auth.uid() = user_id or
 * public.is_admin()`, so an unfiltered read hands an admin every user's
 * notifications — all written in the second person. That is exactly what
 * happened: seventeen "Email confirmed" rows belonging to seventeen
 * different people, showing in one admin's personal feed and reported as
 * duplicates.
 *
 * These assert the predicate is actually sent to PostgREST, because that
 * is the only thing standing between a personal screen and everyone
 * else's activity. A test that merely rendered rows would pass against
 * the broken version too — the mock returns whatever it is given.
 */

const eq = jest.fn();
const order = jest.fn();
const limit = jest.fn();
const select = jest.fn();
const updateEqUserId = jest.fn();

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(cb, [cb]);
  },
}));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

const mockFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;

beforeEach(() => {
  jest.clearAllMocks();
  limit.mockResolvedValue({ data: [], error: null });
  order.mockReturnValue({ limit });
  eq.mockReturnValue({ order });
  select.mockReturnValue({ eq });
  updateEqUserId.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({
    select,
    update: () => ({ eq: () => ({ eq: updateEqUserId }) }),
  } as never);
});

it('filters the feed to the signed-in user rather than relying on RLS', async () => {
  await render(<NotificationsScreen />);

  await waitFor(() => expect(select).toHaveBeenCalled());
  // The predicate itself is the security property under test.
  expect(eq).toHaveBeenCalledWith('user_id', 'me');
});

it('never issues an unfiltered read', async () => {
  await render(<NotificationsScreen />);

  await waitFor(() => expect(select).toHaveBeenCalled());
  // order() must be reached THROUGH eq(), never straight off select() —
  // that shape is the pre-fix bug: select('*').order(...).limit(50).
  expect(select.mock.results[0].value).toBe(eq.mock.instances[0] ?? select.mock.results[0].value);
  expect(eq).toHaveBeenCalledTimes(1);
  expect(order).toHaveBeenCalledTimes(1);
});
