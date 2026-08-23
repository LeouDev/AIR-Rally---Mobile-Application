import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import EventDetailScreen from '@/app/events/[id]';
import type { EventDetail } from '@/lib/events';
import { getEventDetail, listMyEventStatuses, listPendingJoinRequests } from '@/lib/events';
import { getActiveMatchForEvent } from '@/lib/ranked';

/**
 * The web event page bridges into Ranked two ways: a link to a match
 * already underway for this event, or (only once the viewer is
 * actually on the court and in the game) an offer to start one.
 * Mobile had neither — these pin both branches as a property of this
 * screen, not which JSX happens to render, mirroring the web's exact
 * gating (src/app/(marketing)/events/[eventId]/page.tsx).
 */

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(callback, [callback]);
  },
  useLocalSearchParams: () => ({ id: 'event-1' }),
}));

jest.mock('@/lib/events', () => ({
  ...jest.requireActual('@/lib/events'),
  getEventDetail: jest.fn(),
  listMyEventStatuses: jest.fn(),
  listPendingJoinRequests: jest.fn(),
}));

jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getActiveMatchForEvent: jest.fn(),
}));

jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

const mockGetEventDetail = getEventDetail as jest.MockedFunction<typeof getEventDetail>;
const mockListMyEventStatuses = listMyEventStatuses as jest.MockedFunction<typeof listMyEventStatuses>;
const mockListPendingJoinRequests = listPendingJoinRequests as jest.MockedFunction<typeof listPendingJoinRequests>;
const mockGetActiveMatchForEvent = getActiveMatchForEvent as jest.MockedFunction<typeof getActiveMatchForEvent>;

function eventFixture(overrides: Partial<EventDetail>): EventDetail {
  return {
    id: 'event-1',
    creator_id: 'organiser-1',
    venue_id: null,
    club_id: null,
    court_id: 'court-1',
    booking_id: null,
    title: 'Saturday Open Play',
    description: null,
    event_type: 'open_play',
    skill_level: null,
    start_time: '2030-06-01T01:00:00.000Z',
    end_time: null,
    max_players: null,
    price_amount: 0,
    currency: 'PHP',
    status: 'published',
    participant_count: 1,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    creator: { id: 'organiser-1', display_name: 'Robin', avatar_url: null },
    venue: null,
    attendees: [],
    isFull: false,
    ...overrides,
  } as EventDetail;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListPendingJoinRequests.mockResolvedValue([]);
});

describe('EventDetailScreen — bridging into Ranked', () => {
  it('links to the match already underway instead of offering to start a second one', async () => {
    mockGetEventDetail.mockResolvedValue(eventFixture({ creator_id: 'me' }));
    mockListMyEventStatuses.mockResolvedValue(new Map());
    mockGetActiveMatchForEvent.mockResolvedValue({ id: 'match-1', status: 'live' });

    await render(<EventDetailScreen />);

    const link = await screen.findByLabelText('Ranked match: In play');
    expect(screen.queryByLabelText('Start a Ranked match here')).toBeNull();

    fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/ranked/[matchId]', params: { matchId: 'match-1' } });
  });

  it("offers to start a match for the organiser, on the event's own court, when none is underway", async () => {
    mockGetEventDetail.mockResolvedValue(eventFixture({ creator_id: 'me', court_id: 'court-9' }));
    mockListMyEventStatuses.mockResolvedValue(new Map());
    mockGetActiveMatchForEvent.mockResolvedValue(null);

    await render(<EventDetailScreen />);

    const link = await screen.findByLabelText('Start a Ranked match here');
    fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/ranked/new',
      params: { event: 'event-1', court: 'court-9' },
    });
  });

  it('offers to start a match for a joined (non-organiser) player too', async () => {
    mockGetEventDetail.mockResolvedValue(eventFixture({ creator_id: 'organiser-1' }));
    mockListMyEventStatuses.mockResolvedValue(new Map([['event-1', 'joined']]));
    mockGetActiveMatchForEvent.mockResolvedValue(null);

    await render(<EventDetailScreen />);

    await screen.findByLabelText('Start a Ranked match here');
  });

  it("hides the bridge from an interested visitor who hasn't joined — a ranked match needs a real party", async () => {
    mockGetEventDetail.mockResolvedValue(eventFixture({ creator_id: 'organiser-1' }));
    mockListMyEventStatuses.mockResolvedValue(new Map());
    mockGetActiveMatchForEvent.mockResolvedValue(null);

    await render(<EventDetailScreen />);

    await screen.findByText('Saturday Open Play');
    expect(screen.queryByLabelText('Start a Ranked match here')).toBeNull();
  });

  it('hides the bridge for a courtless event even for its organiser', async () => {
    mockGetEventDetail.mockResolvedValue(eventFixture({ creator_id: 'me', court_id: null }));
    mockListMyEventStatuses.mockResolvedValue(new Map());
    mockGetActiveMatchForEvent.mockResolvedValue(null);

    await render(<EventDetailScreen />);

    await screen.findByText('Saturday Open Play');
    expect(screen.queryByLabelText('Start a Ranked match here')).toBeNull();
  });
});
