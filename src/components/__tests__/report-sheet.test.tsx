import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { ReportSheet } from '@/components/report-sheet';
import { createReport, ReportError } from '@/lib/reports';

/**
 * One property matters more than everything else in this component:
 *
 *   THE SHEET MUST NEVER CLOSE ON A REPORT THAT WAS NOT WRITTEN.
 *
 * A closed sheet is indistinguishable from a successful one. Someone
 * reporting harassment who watches the sheet dismiss itself believes
 * they have been heard — and if nothing reached the database, they
 * haven't, and they have no way to know. That is the same
 * appears-to-succeed failure family as the invited players and the
 * dropped date filter, except this one fails a person who is already
 * distressed.
 *
 * So the failure paths are tested first and in more detail than the
 * happy one.
 */

jest.mock('@/lib/reports', () => {
  const actual = jest.requireActual('@/lib/reports');
  return { ...actual, createReport: jest.fn() };
});

const mockToastShow = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: mockToastShow }) }));

jest.mock('@/providers/session', () => ({
  useSession: () => ({
    session: { user: { id: 'reporter-1' } },
    isLoaded: true,
    needsAgreement: false,
    markAgreementAccepted: jest.fn(),
    signOut: jest.fn(),
  }),
}));

const mockCreateReport = createReport as jest.MockedFunction<typeof createReport>;

async function renderSheet() {
  const onClose = jest.fn();
  await render(
    <ReportSheet
      visible
      onClose={onClose}
      targetType="post"
      targetId="11111111-1111-1111-1111-111111111111"
      targetLabel="post"
    />
  );
  return { onClose };
}

async function pickReasonAndSend() {
  await fireEvent.press(screen.getByLabelText('Harassment or bullying'));
  await fireEvent.press(screen.getByLabelText('Send report'));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ReportSheet — a failed report never looks like a sent one', () => {
  it('stays open and explains when the write fails', async () => {
    mockCreateReport.mockRejectedValue(new Error('network died'));
    const { onClose } = await renderSheet();

    await pickReasonAndSend();

    await waitFor(() => {
      expect(screen.getByText(/couldn't send that report/i)).toBeTruthy();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  it('never leaks a raw database error to someone reporting abuse', async () => {
    mockCreateReport.mockRejectedValue(
      new Error('new row for relation "reports" violates row-level security policy')
    );
    await renderSheet();

    await pickReasonAndSend();

    await waitFor(() => {
      expect(screen.queryByText(/row-level security/i)).toBeNull();
      expect(screen.getByText(/couldn't send that report/i)).toBeTruthy();
    });
  });

  it('shows the rate-limit message as itself, not as a generic failure', async () => {
    mockCreateReport.mockRejectedValue(
      new ReportError('rate_limited', "You've filed a lot of reports today. Please try again tomorrow.")
    );
    const { onClose } = await renderSheet();

    await pickReasonAndSend();

    await waitFor(() => {
      expect(screen.getByText(/filed a lot of reports today/i)).toBeTruthy();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the duplicate message as itself', async () => {
    mockCreateReport.mockRejectedValue(
      new ReportError('already_reported', "You've already reported this, and we're still looking at it.")
    );
    await renderSheet();

    await pickReasonAndSend();

    await waitFor(() => {
      expect(screen.getByText(/already reported this/i)).toBeTruthy();
    });
  });

  it('lets the reporter retry after a failure rather than stranding them', async () => {
    mockCreateReport.mockRejectedValueOnce(new Error('network died'));
    const { onClose } = await renderSheet();

    await pickReasonAndSend();
    await waitFor(() => expect(screen.getByText(/couldn't send that report/i)).toBeTruthy());

    // The reason is still selected and the button is live again.
    mockCreateReport.mockResolvedValueOnce({ id: 'r1' } as never);
    await fireEvent.press(screen.getByLabelText('Send report'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCreateReport).toHaveBeenCalledTimes(2);
  });
});

describe('ReportSheet — success', () => {
  it('closes and confirms only after the report is written', async () => {
    mockCreateReport.mockResolvedValue({ id: 'r1' } as never);
    const { onClose } = await renderSheet();

    await pickReasonAndSend();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockToastShow).toHaveBeenCalledWith(expect.stringMatching(/report sent/i), 'success');
    expect(mockCreateReport).toHaveBeenCalledWith(
      'reporter-1',
      expect.objectContaining({ targetType: 'post', reason: 'harassment' })
    );
  });

  it('cannot be sent without a reason', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByLabelText('Send report'));

    expect(mockCreateReport).not.toHaveBeenCalled();
  });
});
