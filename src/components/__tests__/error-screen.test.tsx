import { fireEvent, render, screen } from '@testing-library/react-native';
import React, { type PropsWithChildren } from 'react';
import { Share } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ErrorScreen } from '@/components/error-screen';
import { clearReports, listRecentReports } from '@/lib/error-reporting';

/**
 * The behaviour that matters most here is what the screen does NOT do:
 * render the thrown error. `error.message` is exactly where a raw
 * Postgres or Supabase string would reach a customer, and this screen is
 * the last thing between the two. That assertion is first for a reason.
 */

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Wrapper({ children }: PropsWithChildren) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

const RAW_DB_ERROR = new Error(
  'PostgrestException: duplicate key value violates unique constraint "bookings_court_id_time_excl"'
);

beforeEach(async () => {
  jest.restoreAllMocks();
  // The screen writes a real report on mount; keep suites independent.
  await clearReports();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ErrorScreen', () => {
  it('never renders the raw error message', async () => {
    await render(<ErrorScreen error={RAW_DB_ERROR} retry={jest.fn()} />, { wrapper: Wrapper });

    expect(screen.queryByText(/PostgrestException/)).toBeNull();
    expect(screen.queryByText(/duplicate key/)).toBeNull();
    expect(screen.queryByText(/bookings_court_id_time_excl/)).toBeNull();
  });

  it('explains what happened in the player’s terms', async () => {
    await render(<ErrorScreen error={RAW_DB_ERROR} retry={jest.fn()} />, { wrapper: Wrapper });

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText(/Nothing you booked or paid for is affected/)).toBeTruthy();
  });

  it('offers a recovery action that calls retry', async () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    await render(<ErrorScreen error={RAW_DB_ERROR} retry={retry} />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('sends the technical detail only when the player asks for it', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await render(<ErrorScreen error={RAW_DB_ERROR} retry={jest.fn()} />, { wrapper: Wrapper });

    expect(share).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Send report'));

    expect(share).toHaveBeenCalledTimes(1);
    // The detail withheld from the screen is what actually reaches support.
    const message = share.mock.calls[0][0].message as string;
    expect(message).toContain('PostgrestException');
    expect(message).toContain('AIR/Rally error report');
  });

  it('survives a share sheet that rejects', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share targets'));
    await render(<ErrorScreen error={RAW_DB_ERROR} retry={jest.fn()} />, { wrapper: Wrapper });

    // Must not throw out of the handler and re-crash the boundary.
    await fireEvent.press(screen.getByLabelText('Send report'));
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('records the crash so it survives the restart that follows', async () => {
    await render(<ErrorScreen error={RAW_DB_ERROR} retry={jest.fn()} />, { wrapper: Wrapper });

    const reports = await listRecentReports();
    expect(reports).toHaveLength(1);
    expect(reports[0].message).toContain('PostgrestException');
    expect(reports[0].stack).toBeTruthy();
  });

  it('handles a non-Error being thrown', async () => {
    // `throw "boom"` is legal JavaScript and reaches the boundary as a
    // string, so the report builder must not assume `.message` exists.
    await render(<ErrorScreen error={'boom' as unknown as Error} retry={jest.fn()} />, { wrapper: Wrapper });

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    const reports = await listRecentReports();
    expect(reports[0].message).toBe('boom');
  });
});
