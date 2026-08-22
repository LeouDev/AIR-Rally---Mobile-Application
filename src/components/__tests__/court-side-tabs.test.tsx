import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type PropsWithChildren } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import CourtSideScreen from '@/app/court-side/index';
import { listFeedPosts } from '@/lib/posts';

/**
 * COURT/Side's tabs must never claim to have changed a feed they did not.
 *
 * 'Near you' is gone rather than quiet — it needs a device location,
 * which means expo-location, a native dependency already declined once
 * for Explore's radius filter (see the note in lib/venues.ts) and one
 * that moves the OTA fingerprint, so it cannot reach installed builds
 * without a new binary. A tab that can never do its job should not be
 * offered.
 *
 * 'Following' is real: court_side_feed() takes a required p_scope with
 * no default (web repo migration 20260810000077_court_side_feed_scope.sql)
 * and filters in the RPC — not client-side, because the feed pages 20
 * rows at a time on a composite (effective_at, id) cursor, and filtering
 * a page after the fetch would give a player who follows three people
 * near-empty pages and a cursor that skips content they should have seen.
 *
 * An anonymous caller gets zero rows back for 'following' rather than an
 * error, so the client's own job is to hide the tab when signed out —
 * showing it and rendering nothing is the same lie the toast used to
 * tell, just spelled differently.
 */

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Wrapper({ children }: PropsWithChildren) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

const mockToastShow = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: mockToastShow }) }));

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  return {
    router: { push: jest.fn(), back: jest.fn() },
    Stack: { Screen: () => null },
    useFocusEffect: (callback: () => void) => ReactModule.useEffect(callback, [callback]),
  };
});

const SIGNED_IN_SESSION = { user: { id: '11111111-1111-1111-1111-111111111111' } };

// A mutable mock rather than a fixed jest.mock return, so the signed-out
// test can flip session to null without a second render file — the tab's
// visibility depends on this, so it has to be a real variable, not a
// module-scope constant baked in at mock time.
let mockSession: typeof SIGNED_IN_SESSION | null = SIGNED_IN_SESSION;
jest.mock('@/providers/session', () => ({
  useSession: () => ({
    session: mockSession,
    isLoaded: true,
    needsAgreement: false,
    markAgreementAccepted: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock('@/lib/posts', () => ({
  listFeedPosts: jest.fn(),
  createPost: jest.fn(),
  deletePost: jest.fn(),
  likePost: jest.fn(),
  unlikePost: jest.fn(),
  listLikedPostIds: jest.fn(async () => []),
  listResharedPostIds: jest.fn(async () => []),
  resharePost: jest.fn(),
  unresharePost: jest.fn(),
  recordPostMentions: jest.fn(),
}));

jest.mock('@/lib/follows', () => ({
  getPublicProfile: jest.fn(async () => null),
  getFollowCounts: jest.fn(async () => ({ followers: 0, following: 0 })),
  listFollowingIds: jest.fn(async () => []),
  searchPublicProfiles: jest.fn(async () => []),
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
}));

jest.mock('@/lib/clubs', () => ({ listClubsForUser: jest.fn(async () => []) }));

jest.mock('@/lib/events', () => ({
  joinEvent: jest.fn(),
  leaveEvent: jest.fn(),
  listMyEventStatuses: jest.fn(async () => new Map()),
}));

jest.mock('@/lib/post-images', () => ({
  ...jest.requireActual('@/lib/post-images'),
  pickPostImages: jest.fn(),
  uploadPostImages: jest.fn(),
}));

const mockListFeedPosts = listFeedPosts as jest.MockedFunction<typeof listFeedPosts>;

async function renderFeed() {
  mockListFeedPosts.mockResolvedValue({ posts: [], nextCursor: null });
  await render(<CourtSideScreen />, { wrapper: Wrapper });
  await waitFor(() => expect(mockListFeedPosts).toHaveBeenCalled());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = SIGNED_IN_SESSION;
});

describe('COURT/Side feed tabs', () => {
  it('does not offer a tab it cannot honour', async () => {
    await renderFeed();

    expect(screen.queryByText('Near you')).toBeNull();
    expect(screen.getByText('For you')).toBeTruthy();
    expect(screen.getByText('Following')).toBeTruthy();
  });

  it('hides Following rather than showing an always-empty feed when signed out', async () => {
    mockSession = null;
    await renderFeed();

    expect(screen.getByText('For you')).toBeTruthy();
    expect(screen.queryByText('Following')).toBeNull();

    // The initial load must never have asked for a scope it can't serve.
    expect(mockListFeedPosts).toHaveBeenCalledWith(expect.objectContaining({ scope: 'for_you' }));
    expect(mockListFeedPosts).not.toHaveBeenCalledWith(expect.objectContaining({ scope: 'following' }));
  });

  it('switching to Following asks the RPC for that scope, with no false announcement', async () => {
    await renderFeed();
    const callsBefore = mockListFeedPosts.mock.calls.length;

    await fireEvent.press(screen.getByText('Following'));

    // Selection moves...
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Following' }).props.accessibilityState).toEqual({
        selected: true,
      });
    });
    // ...nothing announces it happened...
    expect(mockToastShow).not.toHaveBeenCalled();
    // ...and the feed actually reloads, this time scoped for real. Two
    // calls, not one: switching tabs must fetch a fresh first page under
    // the new scope, not just relabel what 'For you' already returned.
    expect(mockListFeedPosts.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(mockListFeedPosts).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'following' }));
  });
});
