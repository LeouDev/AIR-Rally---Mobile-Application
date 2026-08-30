import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { OpenGamesSection } from '@/components/open-match/open-games-section';
import { listOpenMatchesForCity, type OpenMatchListing } from '@/lib/open-match';

/**
 * "A list of open games near you on the Play tab" — the design's own
 * required in-app surface alongside push, since push permission can
 * always be permanently declined. Read-only for now (no join flow
 * yet), so this pins the states a player actually sees: nothing
 * without a city, loading, empty, a real list with the expiry/headcount
 * line, and an error that doesn't look like an empty list.
 */

jest.mock('@/lib/open-match', () => ({
  ...jest.requireActual('@/lib/open-match'),
  listOpenMatchesForCity: jest.fn(),
}));

const mockListOpenMatchesForCity = listOpenMatchesForCity as jest.MockedFunction<typeof listOpenMatchesForCity>;

function game(overrides: Partial<OpenMatchListing> = {}): OpenMatchListing {
  return {
    id: 'open-1',
    host_id: 'host-1',
    target_city: 'mandaue',
    status: 'open',
    created_at: new Date().toISOString(),
    converted_match_id: null,
    host: { id: 'host-1', display_name: 'Robin', avatar_url: null },
    acceptedCount: 1,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('renders nothing without a city', async () => {
  await render(<OpenGamesSection citySlug={null} />);
  expect(mockListOpenMatchesForCity).not.toHaveBeenCalled();
  expect(screen.queryByText('Open games near you')).toBeNull();
});

it('shows the empty state, not a blank screen, when there are no open games', async () => {
  mockListOpenMatchesForCity.mockResolvedValue([]);
  await render(<OpenGamesSection citySlug="mandaue" />);

  await screen.findByText(/Start one and be the first/);
});

it('lists a real open game with the host, headcount, and expiry', async () => {
  mockListOpenMatchesForCity.mockResolvedValue([game({ acceptedCount: 2 })]);
  await render(<OpenGamesSection citySlug="mandaue" />);

  await screen.findByText("Robin's game");
  expect(screen.getByText(/2 players in/)).toBeTruthy();
  expect(screen.getByText(/Expires in/)).toBeTruthy();
});

it('singularizes the headcount for exactly one player', async () => {
  mockListOpenMatchesForCity.mockResolvedValue([game({ acceptedCount: 1 })]);
  await render(<OpenGamesSection citySlug="mandaue" />);

  await screen.findByText(/1 player in/);
  expect(screen.queryByText(/1 players in/)).toBeNull();
});

it('falls back to "A player" when the host has no profile', async () => {
  mockListOpenMatchesForCity.mockResolvedValue([game({ host: null })]);
  await render(<OpenGamesSection citySlug="mandaue" />);

  await screen.findByText("A player's game");
});

it('shows an error state distinct from the empty state on a failed fetch', async () => {
  mockListOpenMatchesForCity.mockRejectedValue(new Error('network'));
  await render(<OpenGamesSection citySlug="mandaue" />);

  await screen.findByText(/Couldn.t load open games/);
  expect(screen.queryByText(/Start one and be the first/)).toBeNull();
});

it('fetches the right city, not a hardcoded one', async () => {
  mockListOpenMatchesForCity.mockResolvedValue([]);
  await render(<OpenGamesSection citySlug="davao" />);

  expect(mockListOpenMatchesForCity).toHaveBeenCalledWith('davao');
});
