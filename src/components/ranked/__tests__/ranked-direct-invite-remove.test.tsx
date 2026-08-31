import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { RankedDirectInvite } from '@/components/ranked/ranked-direct-invite';
import type { PublicProfile } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import { getPlayerRank } from '@/lib/ranked';

/** Its own file — see ranked-direct-invite.test.tsx for why. */

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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPlayerRank.mockResolvedValue(null);
  mockSearch.mockResolvedValue([P1]);
});

/** searchPublicProfiles()'s promise chain is `.then(setResults).finally
 * (setSearching)` — `finally` resolves on a SEPARATE microtask turn
 * after `then`, so the moment `findByText` sees a result appear (which
 * only needs `setResults` to have run), the outer `finally` hasn't
 * fired yet. Left undrained, it fires later, outside any `act()` this
 * test wraps around the NEXT interaction, which is exactly the "not
 * wrapped in act" warning this silently causes — and left long enough,
 * it visibly delays state updates for the interaction that follows. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

it('removing an invited player disables Start match, and they can be invited again', async () => {
  const view = await render(<RankedDirectInvite host={HOST} onCreated={jest.fn()} />);

  fireEvent.changeText(view.getByLabelText('Search players by name'), 'Robin');
  const firstResult = await view.findByText('Robin', {}, { timeout: 3000 });
  await act(async () => fireEvent.press(firstResult));
  await settle();
  expect(view.getByLabelText('Start match').props.accessibilityState.disabled).toBe(false);

  fireEvent.press(view.getByLabelText('Remove Robin'));
  await waitFor(() => expect(view.queryByText('Robin')).toBeNull());
  expect(view.getByLabelText('Start match').props.accessibilityState.disabled).toBe(true);

  fireEvent.changeText(view.getByLabelText('Search players by name'), 'Robin');
  const secondResult = await view.findByText('Robin', {}, { timeout: 3000 });
  await act(async () => fireEvent.press(secondResult));
  await settle();

  expect(view.getByText('Robin')).toBeTruthy();
  expect(view.getByLabelText('Start match').props.accessibilityState.disabled).toBe(false);
});
