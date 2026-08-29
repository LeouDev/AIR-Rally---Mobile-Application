import { render, screen } from '@testing-library/react-native';
import React from 'react';

import LeaderboardScreen from '@/app/ranked/leaderboard';
import { getLeaderboardEntry, listLeaderboard } from '@/lib/ranked';

/**
 * Founder-requested rename, user-facing text only: the screen header
 * used to read "Leaderboard", too long to fit as a third of the
 * profile rank card's action row without breaking mid-word. Renamed
 * to "Ladder" everywhere a player sees it. The route (/ranked/
 * leaderboard), the DB view (ranked_leaderboard), and every internal
 * identifier (listLeaderboard, getLeaderboardEntry, LeaderboardScreen,
 * RankedLeaderboardRow) keep their names — renaming those would break
 * shared links and notification link_urls for zero user benefit.
 */

jest.mock('expo-router', () => {
  const actual = jest.requireActual('react-native');
  return {
    router: { push: jest.fn(), back: jest.fn() },
    useFocusEffect: (cb: () => void) => cb(),
    Stack: {
      Screen: (props: { options?: { title?: string } }) => {
        const { Text } = actual;
        return <Text>{`screen-title:${props.options?.title}`}</Text>;
      },
    },
  };
});

jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  listLeaderboard: jest.fn(),
  getLeaderboardEntry: jest.fn(),
}));

jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: null }),
}));

const mockListLeaderboard = listLeaderboard as jest.MockedFunction<typeof listLeaderboard>;
const mockGetLeaderboardEntry = getLeaderboardEntry as jest.MockedFunction<typeof getLeaderboardEntry>;

beforeEach(() => {
  jest.clearAllMocks();
  mockListLeaderboard.mockResolvedValue([]);
  mockGetLeaderboardEntry.mockResolvedValue(null);
});

it('titles the screen "Ladder", not "Leaderboard"', async () => {
  await render(<LeaderboardScreen />);

  await screen.findByText('screen-title:Ladder');
  expect(screen.queryByText('screen-title:Leaderboard')).toBeNull();
});
