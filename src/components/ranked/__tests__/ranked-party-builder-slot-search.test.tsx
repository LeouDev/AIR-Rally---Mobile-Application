import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { RankedPartyBuilder } from '@/components/ranked/ranked-party-builder';
import type { PublicProfile } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import { getPlayerRank } from '@/lib/ranked';

/**
 * The founder wants the player search living in each empty slot's own
 * placeholder rather than one shared box at the bottom — tapping a
 * slot is what opens its search, and only one slot searches at a
 * time. None of these fire the real debounce timer (queries stay
 * under 2 characters or aren't typed at all), so they're safe to
 * share a file — see ranked-party-builder-debounce-fires.test.tsx for
 * why a firing test can't.
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

const HOST: PublicProfile = { id: 'host-1', display_name: 'Leou', avatar_url: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPlayerRank.mockResolvedValue(null);
});

describe('RankedPartyBuilder — search lives in each slot', () => {
  it('shows no shared search box until a slot is tapped', async () => {
    await render(<RankedPartyBuilder host={HOST} matchType="singles" onCreated={jest.fn()} />);

    expect(screen.queryByLabelText('Search players by name')).toBeNull();
    await screen.findByLabelText('Search for opponent');
  });

  it('opens the tapped slot’s own search field, not a shared one', async () => {
    await render(<RankedPartyBuilder host={HOST} matchType="doubles" onCreated={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('Search for partner'));
    await screen.findByPlaceholderText('Search for partner');
    // Doubles has two OPPONENT slots (same role label by design — a
    // pre-existing ambiguity in the UI itself, not this test's
    // concern) — findAllBy* confirms neither of them opened.
    expect(screen.queryAllByPlaceholderText('Search for opponent')).toHaveLength(0);
  });

  it('collapses back to the placeholder when the same slot is closed via its own X', async () => {
    await render(<RankedPartyBuilder host={HOST} matchType="singles" onCreated={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('Search for opponent'));
    await screen.findByPlaceholderText('Search for opponent');

    fireEvent.press(screen.getByLabelText('Stop searching for opponent'));
    await screen.findByText('Tap to search for opponent');
    expect(screen.queryByPlaceholderText('Search for opponent')).toBeNull();
  });

  it('never fires a search for a query under two characters, slot search or not', async () => {
    mockSearch.mockResolvedValue([]);
    await render(<RankedPartyBuilder host={HOST} matchType="singles" onCreated={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('Search for opponent'));
    fireEvent.changeText(await screen.findByLabelText('Search players by name'), 'R');

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mockSearch).not.toHaveBeenCalled();
  });

  // Last on purpose: switching the active slot focuses a different
  // TextInput via a native bridge call, whose completion isn't
  // act()-wrapped — same shape as the debounce-timer poisoning
  // documented in ranked-party-builder-debounce-fires.test.tsx, just
  // from TextInput.focus() instead of a timer. Confirmed by ordering:
  // moving this test after the others stopped it from breaking them.
  it('switches which slot is searching when a different empty slot is tapped, clearing the first', async () => {
    await render(<RankedPartyBuilder host={HOST} matchType="doubles" onCreated={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('Search for partner'));
    const partnerInput = await screen.findByPlaceholderText('Search for partner');
    fireEvent.changeText(partnerInput, 'R');

    fireEvent.press(screen.getAllByLabelText('Search for opponent')[0]);
    const opponentInput = await screen.findByPlaceholderText('Search for opponent');
    expect(screen.queryByPlaceholderText('Search for partner')).toBeNull();
    // The new slot's field starts empty — the old query didn't follow it.
    expect(opponentInput.props.value).toBe('');
  });
});
