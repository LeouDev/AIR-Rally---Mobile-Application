import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

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
 * The viewer-side half of the join flow. JoinRequestStatus is server-
 * controlled (see the RequestStatusBody switch's own comment), so this
 * pins that every KNOWN status renders correctly AND that a status the
 * client doesn't recognize degrades instead of rendering nothing — the
 * same c3e772b shape, this time verified from the first commit rather
 * than after a crash.
 */

jest.mock('@/lib/open-match', () => ({
  ...jest.requireActual('@/lib/open-match'),
  getMyJoinRequest: jest.fn(),
  requestToJoinOpenMatch: jest.fn(),
  withdrawJoinRequest: jest.fn(),
}));

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
    status: 'pending',
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

it('sends the request for THIS match and confirms, on tap', async () => {
  mockGetMyJoinRequest.mockResolvedValue(null);
  mockRequestToJoinOpenMatch.mockResolvedValue(undefined);
  await renderSheet(openMatch({ id: 'open-42' }));

  const button = await screen.findByText('Request to join');
  await act(async () => {
    fireEvent.press(button);
  });

  expect(mockRequestToJoinOpenMatch).toHaveBeenCalledWith('open-42');
  await screen.findByText('Waiting on the host to respond.');
});

it('keeps the sheet open and shows the founder\'s own error text when the request is rejected', async () => {
  mockGetMyJoinRequest.mockResolvedValue(null);
  mockRequestToJoinOpenMatch.mockRejectedValue(new RankedError('You cannot party/play with this player, rank gap is too high.'));
  await renderSheet();

  const button = await screen.findByText('Request to join');
  await act(async () => {
    fireEvent.press(button);
  });

  expect(mockToastShow).toHaveBeenCalledWith('You cannot party/play with this player, rank gap is too high.', 'error');
  // Stayed open on the request screen — did not silently flip to "pending".
  expect(screen.getByText('Request to join')).toBeTruthy();
});

it('shows a pending request with a withdraw option', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ status: 'pending' }));
  await renderSheet();

  await screen.findByText('Waiting on the host to respond.');
  expect(screen.getByText('Withdraw request')).toBeTruthy();
});

it('withdraws the correct request id on tap', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ id: 'req-99', status: 'pending' }));
  mockWithdrawJoinRequest.mockResolvedValue(undefined);
  await renderSheet();

  const button = await screen.findByText('Withdraw request');
  await act(async () => {
    fireEvent.press(button);
  });

  expect(mockWithdrawJoinRequest).toHaveBeenCalledWith('req-99');
  await screen.findByText('Request to join');
});

it('shows an accepted request as confirmed, with no action button', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ status: 'accepted' }));
  await renderSheet();

  await screen.findByText(/You.re in/);
  expect(screen.queryByText('Request to join')).toBeNull();
  expect(screen.queryByText('Withdraw request')).toBeNull();
});

it('shows a kicked request distinctly from a decline', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ status: 'kicked' }));
  await renderSheet();

  await screen.findByText('You were removed from this game.');
});

it('reads "declined" as "the host said no" when the match is still open', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ status: 'declined' }));
  await renderSheet(openMatch({ status: 'open' }));

  await screen.findByText('The host declined your request.');
});

it('reads "declined" as "this match is full" when the parent open match converted', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ status: 'declined' }));
  await renderSheet(openMatch({ status: 'converted' }));

  await screen.findByText('This match is full.');
});

it('offers to request again after a withdrawn request', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ status: 'withdrawn' }));
  await renderSheet();

  await screen.findByText('Request to join');
});

it('degrades to a neutral state instead of rendering nothing for a status this build does not recognize', async () => {
  mockGetMyJoinRequest.mockResolvedValue(joinRequest({ status: 'archived' as never }));
  await renderSheet();

  await screen.findByText(/Status unavailable/);
});
