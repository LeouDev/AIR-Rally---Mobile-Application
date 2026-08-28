import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { RankedPartyBuilder } from '@/components/ranked/ranked-party-builder';
import type { PublicProfile } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import { createRankedMatch, getPlayerRank } from '@/lib/ranked';

/**
 * `confirmBeforeCreate` (built for the Play doorway's calibrated-but-
 * unbooked confirmation, see app/ranked/play.tsx) gates submit() before
 * create_ranked_match() ever fires. Pins the CTO-flagged failure shape
 * from the scoring-button bug (live-scoreboard.tsx's shared `busy`
 * flag): a declined confirmation must abort BEFORE `submitting` flips
 * true, or the Find match button would read "Starting match…" and stay
 * disabled for a match that was never actually going to start.
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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPlayerRank.mockResolvedValue(null);
  mockCreate.mockResolvedValue('match-1');
  mockSearch.mockResolvedValue([ROBIN]);
});

async function fillOpponent() {
  fireEvent.press(screen.getByLabelText('Search for opponent'));
  const input = await screen.findByLabelText('Search players by name');
  fireEvent.changeText(input, 'Robin');
  fireEvent.press(await screen.findByText('Robin'));
  await screen.findByText('Robin');
}

it('creates the match directly when no confirmBeforeCreate is passed', async () => {
  await render(<RankedPartyBuilder host={HOST} matchType="singles" onCreated={jest.fn()} />);
  await fillOpponent();

  fireEvent.press(screen.getByText('Find match'));
  await waitFor(() => expect(mockCreate).toHaveBeenCalled());
});

it('creates the match once confirmBeforeCreate resolves true', async () => {
  const confirmBeforeCreate = jest.fn().mockResolvedValue(true);
  await render(<RankedPartyBuilder host={HOST} matchType="singles" onCreated={jest.fn()} confirmBeforeCreate={confirmBeforeCreate} />);
  await fillOpponent();

  fireEvent.press(screen.getByText('Find match'));
  await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  expect(confirmBeforeCreate).toHaveBeenCalled();
});

it('never calls createRankedMatch when confirmBeforeCreate resolves false', async () => {
  const confirmBeforeCreate = jest.fn().mockResolvedValue(false);
  await render(<RankedPartyBuilder host={HOST} matchType="singles" onCreated={jest.fn()} confirmBeforeCreate={confirmBeforeCreate} />);
  await fillOpponent();

  fireEvent.press(screen.getByText('Find match'));
  await waitFor(() => expect(confirmBeforeCreate).toHaveBeenCalled());
  expect(mockCreate).not.toHaveBeenCalled();
});

it('leaves the button in its normal, pressable state after a decline — never stuck reading "Starting match…"', async () => {
  const confirmBeforeCreate = jest.fn().mockResolvedValue(false);
  await render(<RankedPartyBuilder host={HOST} matchType="singles" onCreated={jest.fn()} confirmBeforeCreate={confirmBeforeCreate} />);
  await fillOpponent();

  fireEvent.press(screen.getByText('Find match'));
  await waitFor(() => expect(confirmBeforeCreate).toHaveBeenCalled());

  // Not "Starting match…", and pressable again — a decline must never
  // leave `submitting` true, since confirmBeforeCreate is awaited
  // BEFORE setSubmitting(true) rather than inside the try/finally.
  await screen.findByText('Find match');
  expect(screen.queryByText('Starting match…')).toBeNull();

  fireEvent.press(screen.getByText('Find match'));
  await waitFor(() => expect(confirmBeforeCreate).toHaveBeenCalledTimes(2));
});
