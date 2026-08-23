import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import BlockedPlayersScreen from '@/app/blocked/index';
import { listMyBlocks, unblockUser } from '@/lib/blocks';

/**
 * Unblocking someone who then STAYS blocked, silently, is the same
 * failure family as everything else tonight — the row disappears, the
 * person believes they've unblocked someone, and the next visit to this
 * screen shows the row back with no memory of why. These pin that a
 * failed unblock is visible immediately, in place, not discovered later.
 */

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(callback, [callback]);
  },
}));

const mockToastShow = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: mockToastShow }) }));

jest.mock('@/providers/session', () => ({
  useSession: () => ({
    session: { user: { id: 'me' } },
    isLoaded: true,
    needsAgreement: false,
    markAgreementAccepted: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock('@/lib/blocks', () => ({ listMyBlocks: jest.fn(), unblockUser: jest.fn() }));

const mockListMyBlocks = listMyBlocks as jest.MockedFunction<typeof listMyBlocks>;
const mockUnblockUser = unblockUser as jest.MockedFunction<typeof unblockUser>;

const ROBIN = { blocked_id: 'them', display_name: 'Robin Cruz', avatar_url: null, created_at: '2026-08-01T00:00:00Z' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BlockedPlayersScreen', () => {
  it('lists blocked players by name', async () => {
    mockListMyBlocks.mockResolvedValue([ROBIN]);
    await render(<BlockedPlayersScreen />);

    await screen.findByText('Robin Cruz');
  });

  it('shows the empty state when nothing is blocked', async () => {
    mockListMyBlocks.mockResolvedValue([]);
    await render(<BlockedPlayersScreen />);

    await screen.findByText("You haven't blocked anyone");
  });

  it('removes the row immediately on Unblock', async () => {
    mockListMyBlocks.mockResolvedValue([ROBIN]);
    mockUnblockUser.mockResolvedValue(undefined);
    await render(<BlockedPlayersScreen />);
    await screen.findByText('Robin Cruz');

    await fireEvent.press(screen.getByLabelText('Unblock Robin Cruz'));

    await waitFor(() => expect(screen.queryByText('Robin Cruz')).toBeNull());
    expect(mockUnblockUser).toHaveBeenCalledWith('me', 'them');
  });

  it('restores the row and says why when unblocking fails — never a silent, still-blocked person', async () => {
    mockListMyBlocks.mockResolvedValue([ROBIN]);
    mockUnblockUser.mockRejectedValue(new Error('network down'));
    await render(<BlockedPlayersScreen />);
    await screen.findByText('Robin Cruz');

    await fireEvent.press(screen.getByLabelText('Unblock Robin Cruz'));

    // Gone optimistically, then back once the failure is known.
    await waitFor(() => {
      expect(screen.getByText('Robin Cruz')).toBeTruthy();
    });
    expect(mockToastShow).toHaveBeenCalledWith("Couldn't unblock Robin Cruz. Try again.", 'error');
  });

  it('shows a load-failure state distinct from "nothing blocked"', async () => {
    mockListMyBlocks.mockRejectedValue(new Error('network down'));
    await render(<BlockedPlayersScreen />);

    await screen.findByText("Couldn't load your blocked players");
    expect(screen.queryByText("You haven't blocked anyone")).toBeNull();
  });
});
