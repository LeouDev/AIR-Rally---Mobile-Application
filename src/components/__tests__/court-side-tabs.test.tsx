import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type PropsWithChildren } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import CourtSideScreen from '@/app/court-side/index';
import { listFeedPosts } from '@/lib/posts';

/**
 * COURT/Side's tabs must never claim to have changed a feed they did not.
 *
 * The feed comes from court_side_feed(p_limit, p_cursor), which has no
 * scope parameter (web repo migration 20260810000072) — so every tab
 * rendered the same unfiltered feed. Mobile went further than web and
 * TOLD the player otherwise: tapping a tab popped a "<tab> feed
 * selected" toast over a feed nothing had filtered. Web failed
 * silently. A missing feature is a gap; announcing it worked is a lie,
 * and only the lie was ours to fix from here.
 *
 * 'Near you' is gone rather than quiet. It needs a device location,
 * which means expo-location — a native dependency already declined once
 * for Explore's radius filter (see the note in lib/venues.ts), and one
 * that moves the OTA fingerprint, so it cannot reach installed builds
 * without a new binary. A tab that can never do its job should not be
 * offered.
 *
 * 'Following' stays and becomes real once the RPC learns a scope
 * parameter; the filtering has to happen in the RPC, because the feed
 * pages 20 rows at a time on effective_at and filtering a page after
 * the fetch gives a player who follows three people near-empty pages
 * and a cursor that skips past what they should have seen.
 *
 * Until then the assertion below is on ANY toast, not on that one
 * string, so the claim cannot return under new wording. When scope does
 * land, rewrite this against the query the tab produces — do not loosen
 * it to let the announcement back.
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

jest.mock('@/providers/session', () => ({
  useSession: () => ({
    session: { user: { id: '11111111-1111-1111-1111-111111111111' } },
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
  render(<CourtSideScreen />, { wrapper: Wrapper });
  await waitFor(() => expect(mockListFeedPosts).toHaveBeenCalled());
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('COURT/Side feed tabs', () => {
  it('does not offer a tab it cannot honour', async () => {
    await renderFeed();

    expect(screen.queryByText('Near you')).toBeNull();
    expect(screen.getByText('For you')).toBeTruthy();
    expect(screen.getByText('Following')).toBeTruthy();
  });

  it('moves the selection without claiming the feed changed', async () => {
    await renderFeed();
    const callsBefore = mockListFeedPosts.mock.calls.length;

    fireEvent.press(screen.getByText('Following'));

    // Selection is the one thing a tab tap legitimately does today, so
    // removing the false announcement must not take it with it.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Following' }).props.accessibilityState).toEqual({
        selected: true,
      });
    });

    // Nothing may claim the feed changed...
    expect(mockToastShow).not.toHaveBeenCalled();
    // ...and nothing did: no refetch, because there is no scope to
    // refetch under. If this line ever fails the feature landed, and the
    // assertion above should be rewritten against the new query rather
    // than loosened to let the announcement back.
    expect(mockListFeedPosts.mock.calls.length).toBe(callsBefore);
  });
});
