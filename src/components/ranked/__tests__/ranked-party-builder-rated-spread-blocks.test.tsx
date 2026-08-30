import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { RankedPartyBuilder } from '@/components/ranked/ranked-party-builder';
import type { PlayerRank, PublicProfile } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import { createRankedMatch, getPlayerRank } from '@/lib/ranked';

/**
 * Its own file, same reason as ranked-party-builder-fills-tapped-slot.test.tsx:
 * the real debounce timer fires here (a result has to actually resolve
 * to be tappable), which poisons whatever render() runs next in the
 * same file — confirmed directly while writing this: the sibling
 * "casual skips the cap" case, in this same file, silently never
 * filled its slot even run alone via `-t`. Splitting fixed it.
 *
 * See ranked-party-builder-rated-spread-allows-casual.test.tsx for the
 * other half of this pair.
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
const mockCreate = createRankedMatch as jest.MockedFunction<typeof createRankedMatch>;

const HOST: PublicProfile = { id: 'host-1', display_name: 'Leou', avatar_url: null };
const ROBIN: PublicProfile = { id: 'opp-1', display_name: 'Robin', avatar_url: null };

function rank(overrides: Partial<PlayerRank>): PlayerRank {
  return {
    season_id: 1,
    user_id: 'x',
    rating: 1000,
    tier: 1,
    pips: 1,
    reliability: 100,
    sandbag_risk_score: 0,
    last_match_at: null,
    in_promotion_series: false,
    star_protection: 0,
    calibration_matches: 10,
    is_calibrated: true,
    wins: 0,
    losses: 0,
    current_streak: 0,
    best_streak: 0,
    best_tier: 1,
    best_pips: 1,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue('match-1');
});

it('a 400-ARR-gap party is blocked when rated (over the 350 cap)', async () => {
  mockGetPlayerRank.mockImplementation(async (id: string) =>
    id === HOST.id ? rank({ user_id: HOST.id, rating: 1000 }) : rank({ user_id: ROBIN.id, rating: 1400 })
  );
  mockSearch.mockResolvedValue([ROBIN]);

  await render(<RankedPartyBuilder host={HOST} matchType="singles" rated onCreated={jest.fn()} />);

  fireEvent.press(screen.getByLabelText('Search for opponent'));
  const input = await screen.findByLabelText('Search players by name');
  fireEvent.changeText(input, 'Robin');
  const result = await screen.findByText('Robin');
  fireEvent.press(result);

  await screen.findByText(/ARR of each other/);
  expect(mockCreate).not.toHaveBeenCalled();
});
