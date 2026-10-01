import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import NotificationsScreen from '@/app/(tabs)/notifications';
import { supabase } from '@/lib/supabase';
import { refreshUnreadCount } from '@/lib/unread';

/**
 * "Mark all read" clears every unread alert in one tap — scoped to the
 * signed-in user in the UPDATE itself (the policy also lets admins update
 * anyone's rows) — and the badge count is refreshed afterwards.
 */

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/unread', () => ({ refreshUnreadCount: jest.fn(async () => {}) }));
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

const rows = [
  { id: 'n1', user_id: 'me', type: 'booking_confirmed', title: 'Booking confirmed', message: 'See you there', read_at: null, link_url: null, created_at: '2026-10-01T00:00:00Z' },
  { id: 'n2', user_id: 'me', type: 'credits_added', title: 'Credits added', message: '₱100', read_at: null, link_url: null, created_at: '2026-10-01T00:00:00Z' },
];

const updateIs = jest.fn();
const updateEq = jest.fn();
const update = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  updateIs.mockResolvedValue({ error: null });
  updateEq.mockReturnValue({ is: updateIs });
  update.mockReturnValue({ eq: updateEq });
  (supabase.from as jest.Mock).mockReturnValue({
    select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }),
    update,
  });
});

it("marks every unread alert read, for this user only, and refreshes the badge", async () => {
  await render(<NotificationsScreen />);

  await fireEvent.press(await screen.findByText('Mark all read'));

  expect(update).toHaveBeenCalledWith({ read_at: expect.any(String) });
  expect(updateEq).toHaveBeenCalledWith('user_id', 'me');
  expect(updateIs).toHaveBeenCalledWith('read_at', null);
  // Nothing left unread, so the control goes away and the rows lose "New".
  await waitFor(() => expect(screen.queryByText('Mark all read')).toBeNull());
  expect(screen.queryByLabelText(/^New: /)).toBeNull();
  expect(refreshUnreadCount).toHaveBeenLastCalledWith('me');
});

it('puts the rows back to unread if the write fails', async () => {
  updateIs.mockResolvedValue({ error: { message: 'Network request failed' } });
  await render(<NotificationsScreen />);

  await fireEvent.press(await screen.findByText('Mark all read'));

  await waitFor(() => expect(screen.getAllByLabelText(/^New: /)).toHaveLength(2));
});
