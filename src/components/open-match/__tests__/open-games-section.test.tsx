import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { OpenGamesSection } from '@/components/open-match/open-games-section';
import { getMyJoinRequest, listOpenMatchesForCity, type OpenMatchListing } from '@/lib/open-match';

/**
 * "A list of open games near you on the Play tab" — the design's own
 * required in-app surface alongside push, since push permission can
 * always be permanently declined. Pins the states a player actually
 * sees: nothing without a city, loading, empty, a real list with the
 * expiry/headcount line, an error that doesn't look like an empty
 * list, and that tapping a row opens the join-request sheet for that
 * specific game rather than a stale or wrong one.
 */

jest.mock('@/lib/open-match', () => ({
  ...jest.requireActual('@/lib/open-match'),
  listOpenMatchesForCity: jest.fn(),
  getMyJoinRequest: jest.fn(),
}));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));

const mockListOpenMatchesForCity = listOpenMatchesForCity as jest.MockedFunction<typeof listOpenMatchesForCity>;
const mockGetMyJoinRequest = getMyJoinRequest as jest.MockedFunction<typeof getMyJoinRequest>;

function game(overrides: Partial<OpenMatchListing> = {}): OpenMatchListing {
  return {
    id: 'open-1',
    host_id: 'host-1',
    target_city: 'mandaue',
    status: 'open',
    created_at: new Date().toISOString(),
    scheduled_at: new Date(Date.now() + 30 * 60000).toISOString(),
    venue_id: null,
    venue_label: null,
    converted_match_id: null,
    host: { id: 'host-1', display_name: 'Robin', avatar_url: null },
    acceptedCount: 1,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMyJoinRequest.mockResolvedValue(null);
});

it('renders nothing without a city', async () => {
  await render(<OpenGamesSection citySlug={null} currentUserId="me" />);
  expect(mockListOpenMatchesForCity).not.toHaveBeenCalled();
  expect(screen.queryByText('Open games near you')).toBeNull();
});

it('shows the empty state, not a blank screen, when there are no open games', async () => {
  mockListOpenMatchesForCity.mockResolvedValue([]);
  await render(<OpenGamesSection citySlug="mandaue" currentUserId="me" />);

  await screen.findByText(/Start one and be the first/);
});

it('lists a real open game with the host, headcount, and expiry', async () => {
  mockListOpenMatchesForCity.mockResolvedValue([game({ acceptedCount: 2 })]);
  await render(<OpenGamesSection citySlug="mandaue" currentUserId="me" />);

  await screen.findByText("Robin's game");
  expect(screen.getByText(/2 players in/)).toBeTruthy();
  expect(screen.getByText(/Expires in/)).toBeTruthy();
});

it('singularizes the headcount for exactly one player', async () => {
  mockListOpenMatchesForCity.mockResolvedValue([game({ acceptedCount: 1 })]);
  await render(<OpenGamesSection citySlug="mandaue" currentUserId="me" />);

  await screen.findByText(/1 player in/);
  expect(screen.queryByText(/1 players in/)).toBeNull();
});

it('falls back to "A player" when the host has no profile', async () => {
  mockListOpenMatchesForCity.mockResolvedValue([game({ host: null })]);
  await render(<OpenGamesSection citySlug="mandaue" currentUserId="me" />);

  await screen.findByText("A player's game");
});

it('shows an error state distinct from the empty state on a failed fetch', async () => {
  mockListOpenMatchesForCity.mockRejectedValue(new Error('network'));
  await render(<OpenGamesSection citySlug="mandaue" currentUserId="me" />);

  await screen.findByText(/Couldn.t load open games/);
  expect(screen.queryByText(/Start one and be the first/)).toBeNull();
});

it('fetches the right city, not a hardcoded one', async () => {
  mockListOpenMatchesForCity.mockResolvedValue([]);
  await render(<OpenGamesSection citySlug="davao" currentUserId="me" />);

  expect(mockListOpenMatchesForCity).toHaveBeenCalledWith('davao');
});

it('tapping a row opens the detail sheet for THAT game, not a different one', async () => {
  mockListOpenMatchesForCity.mockResolvedValue([
    game({ id: 'open-1', host: { id: 'host-1', display_name: 'Robin', avatar_url: null } }),
    game({ id: 'open-2', host: { id: 'host-2', display_name: 'Alex', avatar_url: null } }),
  ]);
  await render(<OpenGamesSection citySlug="mandaue" currentUserId="me" />);

  await screen.findByText("Alex's game");
  fireEvent.press(screen.getByText("Alex's game"));

  await screen.findByText('Open game');
  expect(mockGetMyJoinRequest).toHaveBeenCalledWith('open-2', 'me');
  expect(mockGetMyJoinRequest).not.toHaveBeenCalledWith('open-1', 'me');
});
