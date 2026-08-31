import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { RankedDirectInvite } from '@/components/ranked/ranked-direct-invite';
import type { PublicProfile } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import { getPlayerRank } from '@/lib/ranked';

/**
 * Its own file — one render(), one real debounce-driven flow through
 * all four slots — same isolation reasoning as
 * ranked-party-builder-fills-tapped-slot.test.tsx. See
 * ranked-direct-invite.test.tsx for why every real-search scenario here
 * gets its own file rather than sharing a render() with siblings.
 */

jest.mock('@/lib/follows', () => ({ searchPublicProfiles: jest.fn() }));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getPlayerRank: jest.fn(),
  createRankedMatch: jest.fn(),
}));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));

const mockSearch = searchPublicProfiles as jest.MockedFunction<typeof searchPublicProfiles>;
const mockGetPlayerRank = getPlayerRank as jest.MockedFunction<typeof getPlayerRank>;

const HOST: PublicProfile = { id: 'host', display_name: 'Leou', avatar_url: null };
const P1: PublicProfile = { id: 'p1', display_name: 'Robin', avatar_url: null };
const P2: PublicProfile = { id: 'p2', display_name: 'Alex', avatar_url: null };
const P3: PublicProfile = { id: 'p3', display_name: 'Sam', avatar_url: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPlayerRank.mockResolvedValue(null);
  mockSearch.mockResolvedValue([P1, P2, P3]);
});

it('fills from 1 to 4, hitting the 3-player dead end on the way and clearing it at 4', async () => {
  const view = await render(<RankedDirectInvite host={HOST} onCreated={jest.fn()} />);

  fireEvent.changeText(view.getByLabelText('Search players by name'), 'Robin');
  const robin = await view.findByText('Robin', {}, { timeout: 3000 });
  await act(async () => fireEvent.press(robin));

  expect(view.getByText('2 of 4')).toBeTruthy();
  expect(view.getByLabelText('Search players by name').props.value).toBe('');
  expect(view.getByLabelText('Start match').props.accessibilityState.disabled).toBe(false);

  fireEvent.changeText(view.getByLabelText('Search players by name'), 'Alex');
  const alex = await view.findByText('Alex', {}, { timeout: 3000 });
  await act(async () => fireEvent.press(alex));

  await view.findByText(/3 players can.t start a match/);
  expect(view.getByLabelText('Start match').props.accessibilityState.disabled).toBe(true);

  fireEvent.changeText(view.getByLabelText('Search players by name'), 'Sam');
  const sam = await view.findByText('Sam', {}, { timeout: 3000 });
  await act(async () => fireEvent.press(sam));

  expect(view.getByText('4 of 4')).toBeTruthy();
  expect(view.queryByText(/3 players can.t start a match/)).toBeNull();
  expect(view.getByLabelText('Start match').props.accessibilityState.disabled).toBe(false);
  // At 4, the search row itself disappears — nowhere left to invite a 5th.
  expect(view.queryByLabelText('Search players by name')).toBeNull();
});
