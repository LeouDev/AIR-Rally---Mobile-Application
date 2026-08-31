import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { RankedDirectInvite } from '@/components/ranked/ranked-direct-invite';
import type { PublicProfile } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import { createRankedMatch, getPlayerRank } from '@/lib/ranked';

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
const mockCreateRankedMatch = createRankedMatch as jest.MockedFunction<typeof createRankedMatch>;

const HOST: PublicProfile = { id: 'host', display_name: 'Leou', avatar_url: null };
const P1: PublicProfile = { id: 'p1', display_name: 'Robin', avatar_url: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPlayerRank.mockResolvedValue(null);
  mockSearch.mockResolvedValue([P1]);
});

it('submits singles with host + the one invited player, no split needed', async () => {
  mockCreateRankedMatch.mockResolvedValue('match-1');
  const onCreated = jest.fn();
  const view = await render(<RankedDirectInvite host={HOST} onCreated={onCreated} />);

  fireEvent.changeText(view.getByLabelText('Search players by name'), 'Robin');
  const result = await view.findByText('Robin', {}, { timeout: 3000 });
  await act(async () => fireEvent.press(result));

  await act(async () => {
    fireEvent.press(view.getByLabelText('Start match'));
  });

  expect(mockCreateRankedMatch).toHaveBeenCalledWith({
    matchType: 'singles',
    teamA: ['host'],
    teamB: ['p1'],
    rated: true,
  });
  expect(onCreated).toHaveBeenCalledWith('match-1');
});
