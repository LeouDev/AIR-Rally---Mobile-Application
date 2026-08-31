import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { RankedDirectInvite } from '@/components/ranked/ranked-direct-invite';
import type { PlayerRank, PublicProfile } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import { createRankedMatch, getPlayerRank } from '@/lib/ranked';

/**
 * Its own file — see ranked-direct-invite.test.tsx for why. Pins that
 * the doubles submit path actually calls splitDoublesTeamsByRating's
 * rule end to end, not just that the pure function itself is correct
 * in isolation. Ratings are 1000/1080/1150/1300 rather than the design
 * memo's own 1000/1100/1200/1400 worked example (see
 * split-doubles-teams-by-rating.test.ts for that one) — a 400-point
 * spread exceeds RANKED_MAX_PARTY_ARR_SPREAD (350) and this component
 * enforces that cap before it'll let Start match fire at all, same as
 * the real party builder. Sort order and thus the expected pairing is
 * unchanged; only the spread shrinks to something this roster is
 * actually eligible to play as a rated match.
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
const mockCreateRankedMatch = createRankedMatch as jest.MockedFunction<typeof createRankedMatch>;

const HOST: PublicProfile = { id: 'host', display_name: 'Leou', avatar_url: null };
const P1: PublicProfile = { id: 'p1', display_name: 'Robin', avatar_url: null };
const P2: PublicProfile = { id: 'p2', display_name: 'Alex', avatar_url: null };
const P3: PublicProfile = { id: 'p3', display_name: 'Sam', avatar_url: null };

function rankFixture(userId: string, rating: number): PlayerRank {
  return {
    season_id: 1,
    user_id: userId,
    rating,
    tier: 1,
    pips: 1,
    reliability: 0,
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
    best_tier: null,
    best_pips: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch.mockResolvedValue([P1, P2, P3]);
  mockGetPlayerRank.mockImplementation((userId: string) => {
    const ratings: Record<string, number> = { host: 1000, p1: 1080, p2: 1150, p3: 1300 };
    return Promise.resolve(rankFixture(userId, ratings[userId]));
  });
});

it('submits doubles at 4 with teams auto-split by rating — {lowest,highest} vs the two middle', async () => {
  mockCreateRankedMatch.mockResolvedValue('match-2');
  const onCreated = jest.fn();
  const view = await render(<RankedDirectInvite host={HOST} onCreated={onCreated} />);

  for (const player of [P1, P2, P3]) {
    const name = player.display_name as string;
    fireEvent.changeText(view.getByLabelText('Search players by name'), name);
    const result = await view.findByText(name, {}, { timeout: 3000 });
    await act(async () => fireEvent.press(result));
  }

  await view.findByText('4 of 4');
  // The per-player rank fetches (triggered on each invite) settle
  // asynchronously — Start match only enables once eligibility can be
  // computed from all four, so waiting for it to enable IS waiting for
  // those fetches, without a fixed number of manual microtask flushes.
  await waitFor(() => {
    expect(view.getByLabelText('Start match').props.accessibilityState.disabled).toBe(false);
  });

  await act(async () => {
    fireEvent.press(view.getByLabelText('Start match'));
  });

  expect(mockCreateRankedMatch).toHaveBeenCalledWith({
    matchType: 'doubles',
    teamA: ['host', 'p3'],
    teamB: ['p1', 'p2'],
    rated: true,
  });
  expect(onCreated).toHaveBeenCalledWith('match-2');
});
