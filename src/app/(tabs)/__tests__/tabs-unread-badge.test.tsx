import { render, screen } from '@testing-library/react-native';
import React from 'react';

import TabsLayout from '@/app/(tabs)/_layout';
import { syncBookingReminders } from '@/lib/booking-reminders';
import { refreshUnreadCount } from '@/lib/unread';

/**
 * The Alerts tab had no badge and the app icon had none either
 * (shouldSetBadge: false, and nothing ever set a count). The tab shows the
 * unread count now, and the tabs refresh it — along with the phone's
 * booking reminders — when they open.
 */

let mockUnread = 0;
jest.mock('@/lib/unread', () => ({
  ...jest.requireActual('@/lib/unread'),
  refreshUnreadCount: jest.fn(async () => {}),
  useUnreadCount: () => mockUnread,
}));
jest.mock('@/lib/booking-reminders', () => ({ syncBookingReminders: jest.fn(async () => {}) }));
jest.mock('@/providers/session', () => ({ useSession: () => ({ session: { user: { id: 'me' } } }) }));
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
// The native tab bar can't render under Jest; these stand-ins keep its
// structure and expose the badge as text.
jest.mock('expo-router/unstable-native-tabs', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  function NativeTabs({ children }: { children?: React.ReactNode }) {
    return children;
  }
  function Trigger({ children }: { children?: React.ReactNode }) {
    return children;
  }
  Trigger.Label = function Label() {
    return null;
  };
  Trigger.Icon = function Icon() {
    return null;
  };
  Trigger.Badge = function Badge({ children, hidden }: { children?: string; hidden?: boolean }) {
    return hidden ? null : <MockText>{`badge:${children}`}</MockText>;
  };
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});

beforeEach(() => {
  jest.clearAllMocks();
});

it('shows the unread count on the Alerts tab', async () => {
  mockUnread = 3;
  await render(<TabsLayout />);
  expect(screen.getByText('badge:3')).toBeTruthy();
});

it('shows no badge when everything is read', async () => {
  mockUnread = 0;
  await render(<TabsLayout />);
  expect(screen.queryByText(/^badge:/)).toBeNull();
});

it('refreshes the unread count and booking reminders when the tabs open', async () => {
  mockUnread = 0;
  await render(<TabsLayout />);
  expect(refreshUnreadCount).toHaveBeenCalledWith('me');
  expect(syncBookingReminders).toHaveBeenCalledWith('me');
});

