import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import RankedNewMatchScreen from '@/app/ranked/new';
import { getPublicProfile } from '@/lib/follows';

/**
 * The bridge from a game screen lands here with `?event=&court=`. This
 * pins that those params actually reach RankedPartyBuilder unchanged
 * (a typo here would silently start an unlinked or courtless match),
 * that a missing param is refused rather than passed through as
 * `undefined`, and that onCreated actually navigates to the new match.
 */

let mockSearchParams: { event?: string; court?: string; type?: string } = {};
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('@/lib/follows', () => ({ getPublicProfile: jest.fn() }));

jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

jest.mock('@/components/ranked/ranked-party-builder', () => ({
  RankedPartyBuilder: ({
    eventId,
    courtId,
    matchType,
    onCreated,
  }: {
    eventId?: string;
    courtId?: string;
    matchType: string;
    onCreated: (matchId: string) => void;
  }) => {
    const { Pressable, Text, View } = jest.requireActual('react-native');
    return (
      <View>
        <Text>{`party-builder:${eventId}:${courtId}:${matchType}`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="fake-create" onPress={() => onCreated('match-99')} />
      </View>
    );
  },
}));

const mockGetPublicProfile = getPublicProfile as jest.MockedFunction<typeof getPublicProfile>;
const ME = { id: 'me', display_name: 'Galileouuu', avatar_url: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = { event: 'event-1', court: 'court-1' };
});

describe('RankedNewMatchScreen', () => {
  it('hands eventId/courtId straight through to the party builder, defaulting to singles', async () => {
    mockGetPublicProfile.mockResolvedValue(ME);
    await render(<RankedNewMatchScreen />);

    await screen.findByText('party-builder:event-1:court-1:singles');
  });

  it('reads ?type=doubles from the bridge link', async () => {
    mockSearchParams = { event: 'event-1', court: 'court-1', type: 'doubles' };
    mockGetPublicProfile.mockResolvedValue(ME);
    await render(<RankedNewMatchScreen />);

    await screen.findByText('party-builder:event-1:court-1:doubles');
  });

  it('navigates to the new match on creation', async () => {
    mockGetPublicProfile.mockResolvedValue(ME);
    await render(<RankedNewMatchScreen />);

    const createButton = await screen.findByLabelText('fake-create');
    fireEvent.press(createButton);

    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/ranked/[matchId]', params: { matchId: 'match-99' } });
  });

  it('refuses to build a party with no event to attach it to, rather than passing event=undefined through', async () => {
    mockSearchParams = { court: 'court-1' };
    mockGetPublicProfile.mockResolvedValue(ME);
    await render(<RankedNewMatchScreen />);

    await screen.findByText("This link is missing the game it belongs to.");
    expect(screen.queryByText(/party-builder:/)).toBeNull();
  });

  it('refuses to build a party with no court either', async () => {
    mockSearchParams = { event: 'event-1' };
    mockGetPublicProfile.mockResolvedValue(ME);
    await render(<RankedNewMatchScreen />);

    await screen.findByText("This link is missing the game it belongs to.");
    expect(screen.queryByText(/party-builder:/)).toBeNull();
  });
});
