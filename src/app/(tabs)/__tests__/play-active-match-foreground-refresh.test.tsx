import { render } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { act } from 'react-test-renderer';
import React from 'react';

import PlayScreen from '@/app/(tabs)/play';
import { getActiveMatch } from '@/lib/ranked';
import { listMyEventStatuses, listUpcomingEvents } from '@/lib/events';

/**
 * useFocusEffect fires on NAVIGATION focus — it does not fire when the
 * app returns from the background (the screen never blurred in
 * navigation terms), and the only other AppState listener anywhere in
 * this app (lib/supabase.ts) is for auth token refresh, not data
 * refetch. Confirmed by grep, not assumed — see the play.tsx comment
 * this test pins. Scoped to ONLY the active-match resume card, per the
 * CTO's explicit call: severity is wildly uneven across the ~40 other
 * screens using useFocusEffect for freshness, and refetching all of
 * them on every app resume is a real request burst most don't need.
 *
 * The failure mode that matters most here is OVER-firing, not
 * under-firing: iOS reports 'inactive' for things that never actually
 * background the app (a notification-shade pull, a control-centre
 * swipe, a permission dialog), and a naive "next state is active"
 * check would refetch on every one of those. These tests assert the
 * negative as explicitly as the positive.
 */

let appStateListener: ((state: string) => void) | undefined;

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const ReactActual = jest.requireActual('react');
    ReactActual.useEffect(cb, [cb]);
  },
}));
jest.mock('@/lib/events', () => ({
  ...jest.requireActual('@/lib/events'),
  listUpcomingEvents: jest.fn(),
  listMyEventStatuses: jest.fn(),
}));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getActiveMatch: jest.fn(),
}));
jest.mock('@/lib/open-match', () => ({
  ...jest.requireActual('@/lib/open-match'),
  getMyCity: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

const mockList = listUpcomingEvents as jest.MockedFunction<typeof listUpcomingEvents>;
const mockStatuses = listMyEventStatuses as jest.MockedFunction<typeof listMyEventStatuses>;
const mockGetActiveMatch = getActiveMatch as jest.MockedFunction<typeof getActiveMatch>;

beforeEach(() => {
  jest.clearAllMocks();
  appStateListener = undefined;
  mockList.mockResolvedValue([]);
  mockStatuses.mockResolvedValue(new Map());
  mockGetActiveMatch.mockResolvedValue(null);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => {
    appStateListener = cb as (state: string) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('refetches the active match on a real background → active transition', async () => {
  await render(<PlayScreen />);
  expect(mockGetActiveMatch).toHaveBeenCalledTimes(1);
  expect(appStateListener).toBeDefined();

  await act(async () => {
    appStateListener?.('background');
    appStateListener?.('active');
    await Promise.resolve();
  });

  expect(mockGetActiveMatch).toHaveBeenCalledTimes(2);
});

it('does NOT refetch on an inactive → active blip that never reached background (control-centre, notification shade)', async () => {
  await render(<PlayScreen />);
  expect(mockGetActiveMatch).toHaveBeenCalledTimes(1);

  await act(async () => {
    appStateListener?.('inactive');
    appStateListener?.('active');
    await Promise.resolve();
  });

  // Would be 2 under a naive "nextState === 'active'" check — the
  // whole point of tracking the PRIOR state is that this stays 1.
  expect(mockGetActiveMatch).toHaveBeenCalledTimes(1);
});

it('does not refetch on background alone, only once it returns to active', async () => {
  await render(<PlayScreen />);
  expect(mockGetActiveMatch).toHaveBeenCalledTimes(1);

  await act(async () => {
    appStateListener?.('background');
    await Promise.resolve();
  });

  expect(mockGetActiveMatch).toHaveBeenCalledTimes(1);
});

it('a full active → inactive → background → inactive → active cycle (the real iOS sequence) refetches exactly once', async () => {
  await render(<PlayScreen />);
  expect(mockGetActiveMatch).toHaveBeenCalledTimes(1);

  await act(async () => {
    appStateListener?.('inactive');
    appStateListener?.('background');
    appStateListener?.('inactive');
    appStateListener?.('active');
    await Promise.resolve();
  });

  expect(mockGetActiveMatch).toHaveBeenCalledTimes(2);
});
