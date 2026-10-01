import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { OpenMatchDetailSheet } from '@/components/open-match/open-match-detail-sheet';
import {
  RankedError,
  getMyJoinRequest,
  requestToJoinOpenMatch,
  withdrawJoinRequest,
  type OpenMatchJoinRequest,
  type OpenMatchListing,
} from '@/lib/open-match';

/**
 * The viewer-side half of the join flow. Migration 120 (live on
 * production, confirmed directly against the deployed functions):
 * request_to_join_open_match auto-accepts on a passing rank-gap check
 * — no host review, no 'pending' row ever created — and a rejection
 * throws synchronously with nothing written. withdraw_join_request now
 * only operates on an 'accepted' row ("leave a match you already
 * joined"). 'declined' is reachable only via cancel_open_match's
 * cascade — it no longer means "the host said no" or "this match
 * filled up," since neither of those can happen anymore.
 *
 * JoinRequestStatus is still server-controlled, so this also pins that
 * an unrecognized status (including the now-vestigial 'pending', which
 * the switch deliberately doesn't special-case) degrades instead of
 * rendering nothing — the same c3e772b shape.
 */

jest.mock('@/lib/open-match', () => ({
  ...jest.requireActual('@/lib/open-match'),
  getMyJoinRequest: jest.fn(),
  requestToJoinOpenMatch: jest.fn(),
  withdrawJoinRequest: jest.fn(),
  listJoinedPlayers: jest.fn(),
  kickAcceptedPlayer: jest.fn(),
  cancelOpenMatch: jest.fn(),
  startOpenMatchSingles: jest.fn(),
  startOpenMatchFull: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockToastShow = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: mockToastShow }) }));

const mockGetMyJoinRequest = getMyJoinRequest as jest.MockedFunction<typeof getMyJoinRequest>;
const mockRequestToJoinOpenMatch = requestToJoinOpenMatch as jest.MockedFunction<typeof requestToJoinOpenMatch>;
const mockWithdrawJoinRequest = withdrawJoinRequest as jest.MockedFunction<typeof withdrawJoinRequest>;

function openMatch(overrides: Partial<OpenMatchListing> = {}): OpenMatchListing {
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

function joinRequest(overrides: Partial<OpenMatchJoinRequest> = {}): OpenMatchJoinRequest {
  return {
    id: 'req-1',
    open_match_id: 'open-1',
    user_id: 'me',
    status: 'accepted',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

async function renderSheet(match: OpenMatchListing = openMatch()) {
  await render(<OpenMatchDetailSheet visible onClose={jest.fn()} openMatch={match} currentUserId="me" />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('offers "Request to join" when the viewer has never requested', async () => {
  mockGetMyJoinRequest.mockResolvedValue(null);
  await renderSheet();

  await screen.findByText('Request to join');
});

it('a successful request lands as accepted immediately — no waiting state', async () => {
  mockGetMyJoinRequest.mockResolvedValue(null);
  mockRequestToJoinOpenMatch.mockResolvedValue('req-new');
  await renderSheet(openMatch({ id: 'open-42' }));

  const button = await screen.findByText('Request to join');
  await act(async () => {
    fireEvent.press(button);
  });

  expect(mockRequestToJoinOpenMatch).toHaveBeenCalledWith('open-42');
  await screen.findByText(/You.re in/);
  expect(mockToastShow).toHaveBeenCalledWith("You're in!", 'success');
});

it('keeps the sheet open and shows the founder\'s own error text when the request is rejected', async () => {
  mockGetMyJoinRequest.mockResolvedValue(null);
  mockRequestToJoinOpenMatch.mockRejectedValue(new RankedError('You cannot party/play with this player, rank gap is too high.'));
  await renderSheet();

  const button = await screen.findByText('Request to join');
  await act(async () => {
    fireEvent.press(button);
  });

  // In the sheet itself: a toast renders in the root view, underneath
  // this page-sheet Modal, where nobody can see it.
  expect(screen.getByText('You cannot party/play with this player, rank gap is too high.')).toBeTruthy();
  // Stayed open on the request screen — did not silently flip to "accepted".
  expect(screen.getByText('Request to join')).toBeTruthy();
});

it('leaving right after joining withdraws the request the join actually created', async () => {
  // A placeholder id used to stand in for the new row, and
  // withdraw_join_request failed its uuid cast on every tap.
  mockGetMyJoinRequest.mockResolvedValue(null);
  mockRequestToJoinOpenMatch.mockResolvedValue('3bff1573-28a8-44b5-87bb-3077743b7290');
  mockWithdrawJoinRequest.mockResolvedValue(undefined);
  await renderSheet();

  await act(async () => {
    fireEvent.press(await screen.findByText('Request to join'));
  });
  await act(async () => {
    fireEvent.press(await screen.findByText('Leave game'));
  });

  expect(mockWithdrawJoinRequest).toHaveBeenCalledWith('3bff1573-28a8-44b5-87bb-3077743b7290');
});

it('shows an accepted request with a Leave game option', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ status: 'accepted' }));
  await renderSheet();

  await screen.findByText(/You.re in/);
  expect(screen.getByText('Leave game')).toBeTruthy();
  expect(screen.queryByText('Request to join')).toBeNull();
});

it('leaves the correct request id on tap, and offers to request again afterward', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ id: 'req-99', status: 'accepted' }));
  mockWithdrawJoinRequest.mockResolvedValue(undefined);
  await renderSheet();

  const button = await screen.findByText('Leave game');
  await act(async () => {
    fireEvent.press(button);
  });

  expect(mockWithdrawJoinRequest).toHaveBeenCalledWith('req-99');
  expect(mockToastShow).toHaveBeenCalledWith('You left this game.', 'success');
  await screen.findByText('Request to join');
});

it('shows a kicked request distinctly from a cancellation', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ status: 'kicked' }));
  await renderSheet();

  await screen.findByText('You were removed from this game.');
});

it('reads "declined" as the host cancelling the whole match, regardless of the parent open match\'s own status', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ status: 'declined' }));
  await renderSheet(openMatch({ status: 'cancelled' }));

  await screen.findByText('This game was cancelled by the host.');
});

it('offers to request again after leaving (withdrawn)', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ status: 'withdrawn' }));
  await renderSheet();

  await screen.findByText('Request to join');
});

it('degrades to a neutral state instead of rendering nothing for a status this build does not recognize', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ status: 'archived' as never }));
  await renderSheet();

  await screen.findByText(/Status unavailable/);
});

it('degrades the same way for "pending" — unreachable post-120, but not special-cased in the switch', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ status: 'pending' }));
  await renderSheet();

  await screen.findByText(/Status unavailable/);
});

describe('the host side', () => {
  // The host had no UI at all: tapping your own game opened the joiner's
  // sheet, and "Request to join" failed with "You are already hosting this
  // match". The kick / cancel / start RPCs existed with nothing calling them.
  const robin = { requestId: 'req-robin', profile: { id: 'robin', display_name: 'Robin', avatar_url: null } };
  const sam = { requestId: 'req-sam', profile: { id: 'sam', display_name: 'Sam', avatar_url: null } };
  const mocked = jest.requireMock('@/lib/open-match') as Record<string, jest.Mock>;
  const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };

  async function renderAsHost(onClose = jest.fn()) {
    await render(
      <OpenMatchDetailSheet visible onClose={onClose} openMatch={openMatch({ host_id: 'me' })} currentUserId="me" />
    );
    return onClose;
  }

  // Alert.alert's buttons, pressed by label — the confirm step is the point.
  // Returns the handler's promise so the test can wait for its work.
  function pressAlertButton(label: string) {
    const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as {
      text: string;
      onPress?: () => unknown;
    }[];
    return buttons.find((b) => b.text === label)?.onPress?.();
  }

  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // clearAllMocks keeps queued *Once values; a test that consumes fewer
    // than it queued would otherwise leak them into the next one.
    for (const fn of ['listJoinedPlayers', 'kickAcceptedPlayer', 'cancelOpenMatch', 'startOpenMatchSingles']) {
      mocked[fn].mockReset();
    }
    // What the pre-fix sheet asked for: the host has no request row, so it
    // offered "Request to join" — the mutation these tests must catch.
    mockGetMyJoinRequest.mockResolvedValue(null);
  });

  it('gets the host panel instead of "Request to join"', async () => {
    mocked.listJoinedPlayers.mockResolvedValue([]);
    await renderAsHost();

    await screen.findByText(/You.re hosting · 1 of 4 in/);
    expect(screen.getByText('Your game')).toBeTruthy();
    expect(screen.queryByText('Request to join')).toBeNull();
    expect(mockGetMyJoinRequest).not.toHaveBeenCalled();
  });

  it('with one player in, starts singles and takes the host into the match', async () => {
    mocked.listJoinedPlayers.mockResolvedValue([robin]);
    mocked.startOpenMatchSingles.mockResolvedValue('match-9');
    const onClose = await renderAsHost();

    await fireEvent.press(await screen.findByText('Start singles now'));

    expect(mocked.startOpenMatchSingles).toHaveBeenCalledWith('open-1');
    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({ pathname: '/ranked/[matchId]', params: { matchId: 'match-9' } });
  });

  it('at three players offers no start, and says what happens at kickoff', async () => {
    mocked.listJoinedPlayers.mockResolvedValue([robin, sam]);
    await renderAsHost();

    await screen.findByText(/Three players can.t start/);
    expect(screen.queryByText('Start singles now')).toBeNull();
    expect(screen.queryByText('Start doubles now')).toBeNull();
  });

  it('removes a player only after confirming, then reloads the list', async () => {
    mocked.listJoinedPlayers.mockResolvedValueOnce([robin, sam]).mockResolvedValueOnce([sam]);
    mocked.kickAcceptedPlayer.mockResolvedValue(undefined);
    await renderAsHost();

    await fireEvent.press(await screen.findByLabelText('Remove Robin'));
    expect(mocked.kickAcceptedPlayer).not.toHaveBeenCalled();
    await act(async () => {
      await pressAlertButton('Remove');
    });

    expect(mocked.kickAcceptedPlayer).toHaveBeenCalledWith('req-robin');
    await screen.findByText(/You.re hosting · 2 of 4 in/);
  });

  it('cancels the game only after confirming, then closes', async () => {
    mocked.listJoinedPlayers.mockResolvedValue([robin]);
    mocked.cancelOpenMatch.mockResolvedValue(undefined);
    const onClose = await renderAsHost();

    await fireEvent.press(await screen.findByText('Cancel game'));
    expect(mocked.cancelOpenMatch).not.toHaveBeenCalled();
    await act(async () => {
      await pressAlertButton('Cancel game');
    });

    expect(mocked.cancelOpenMatch).toHaveBeenCalledWith('open-1');
    expect(onClose).toHaveBeenCalled();
  });
});
