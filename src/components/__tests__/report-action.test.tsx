import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ActionSheetIOS, Platform } from 'react-native';
import React from 'react';

import { ReportAction } from '@/components/report-action';

/**
 * ReportAction started as a bare flag icon and became an overflow
 * trigger the moment blocking was coming — two standalone icons read as
 * two features, one menu reads as moderation. Two properties matter more
 * than the visual change:
 *
 *   1. Report must still be reachable in essentially one interaction —
 *      someone reaching for it is often distressed, and the menu
 *      existing at all must not make that meaningfully slower.
 *   2. Report must be the FIRST option, not buried behind Block once
 *      that lands.
 */

jest.mock('@/lib/reports', () => ({
  ...jest.requireActual('@/lib/reports'),
  createReport: jest.fn(),
}));

describe('ReportAction', () => {
  it('opens the native iOS action sheet with Report listed first', async () => {
    Platform.OS = 'ios';
    const spy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});

    await render(<ReportAction targetType="post" targetId="p1" targetLabel="post" />);
    await fireEvent.press(screen.getByLabelText('More options for this post'));

    expect(spy).toHaveBeenCalledTimes(1);
    const [config] = spy.mock.calls[0];
    expect(config.options[0]).toBe('Report');

    spy.mockRestore();
  });

  it('selecting Report from the sheet opens the report sheet itself', async () => {
    Platform.OS = 'ios';
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_config, callback) => {
      callback(0); // "Report" is index 0
    });

    await render(<ReportAction targetType="post" targetId="p1" targetLabel="post" />);
    await fireEvent.press(screen.getByLabelText('More options for this post'));

    await waitFor(() => {
      expect(screen.getByText('Report post')).toBeTruthy();
    });

    jest.restoreAllMocks();
  });

  it('does not open the report sheet when the menu is dismissed', async () => {
    Platform.OS = 'ios';
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_config, callback) => {
      callback(1); // "Cancel" is index 1
    });

    await render(<ReportAction targetType="post" targetId="p1" targetLabel="post" />);
    await fireEvent.press(screen.getByLabelText('More options for this post'));

    expect(screen.queryByText('Report post')).toBeNull();

    jest.restoreAllMocks();
  });
});
