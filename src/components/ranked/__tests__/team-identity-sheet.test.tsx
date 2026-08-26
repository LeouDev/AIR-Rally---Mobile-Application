import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { TeamIdentitySheet } from '@/components/ranked/team-identity-sheet';
import { listClubsForUser } from '@/lib/clubs';
import { RankedError, setTeamIdentity } from '@/lib/ranked';

/**
 * Same "never closes on a write that didn't happen" discipline as
 * report-sheet.tsx — see that file's own test header for why this
 * property gets tested first and in more detail than the happy path.
 */

jest.mock('@/lib/clubs', () => ({ listClubsForUser: jest.fn() }));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  setTeamIdentity: jest.fn(),
}));

const mockToastShow = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: mockToastShow }) }));

const mockListClubsForUser = listClubsForUser as jest.MockedFunction<typeof listClubsForUser>;
const mockSetTeamIdentity = setTeamIdentity as jest.MockedFunction<typeof setTeamIdentity>;

async function renderSheet(overrides: Partial<React.ComponentProps<typeof TeamIdentitySheet>> = {}) {
  const onClose = jest.fn();
  await render(
    <TeamIdentitySheet
      visible
      onClose={onClose}
      matchId="match-1"
      team="a"
      userId="me"
      currentName={null}
      currentClub={null}
      {...overrides}
    />
  );
  return { onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListClubsForUser.mockResolvedValue([]);
});

describe('TeamIdentitySheet — a failed save never looks like a saved one', () => {
  it('stays open and shows the server message when the write fails', async () => {
    mockSetTeamIdentity.mockRejectedValue(new RankedError('You are not a member of that club.'));
    mockListClubsForUser.mockResolvedValue([{ id: 'club-1', name: 'Rally Point' } as never]);
    const { onClose } = await renderSheet({ currentClub: { id: 'club-1', name: 'Rally Point' } });
    await screen.findByLabelText('Rally Point');

    await fireEvent.press(screen.getByLabelText('Save'));

    await waitFor(() => expect(screen.getByText(/not a member of that club/)).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  it('will not submit an empty custom name', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByLabelText('Save'));

    expect(mockSetTeamIdentity).not.toHaveBeenCalled();
    await screen.findByText(/enter a team name/i);
  });
});

describe('TeamIdentitySheet — success', () => {
  it('saves a custom name and closes only after the write lands', async () => {
    mockSetTeamIdentity.mockResolvedValue(undefined);
    const { onClose } = await renderSheet();

    await fireEvent.changeText(screen.getByLabelText('Team name'), 'The Smashers');
    await fireEvent.press(screen.getByLabelText('Save'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockSetTeamIdentity).toHaveBeenCalledWith('match-1', 'a', { name: 'The Smashers' });
  });

  it('saves the chosen club, not a typed name', async () => {
    mockListClubsForUser.mockResolvedValue([
      { id: 'club-1', name: 'Rally Point' } as never,
      { id: 'club-2', name: 'Net Ninjas' } as never,
    ]);
    mockSetTeamIdentity.mockResolvedValue(undefined);
    const { onClose } = await renderSheet();

    await fireEvent.press(screen.getByRole('button', { name: 'Club' }));
    await screen.findByLabelText('Net Ninjas');
    await fireEvent.press(screen.getByLabelText('Net Ninjas'));
    await fireEvent.press(screen.getByLabelText('Save'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockSetTeamIdentity).toHaveBeenCalledWith('match-1', 'a', { clubId: 'club-2' });
  });

  it('offers Clear only when an identity is already set, and it submits null', async () => {
    mockSetTeamIdentity.mockResolvedValue(undefined);
    const { onClose } = await renderSheet({ currentName: 'The Smashers' });

    expect(screen.getByLabelText('Clear')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Clear'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockSetTeamIdentity).toHaveBeenCalledWith('match-1', 'a', null);
  });

  it('does not offer Clear when no identity is set yet', async () => {
    await renderSheet();

    expect(screen.queryByLabelText('Clear')).toBeNull();
  });
});
