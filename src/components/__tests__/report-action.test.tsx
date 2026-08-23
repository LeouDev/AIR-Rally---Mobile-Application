import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import React from 'react';

import { ReportAction } from '@/components/report-action';
import { blockUser } from '@/lib/blocks';

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

jest.mock('@/lib/blocks', () => ({ blockUser: jest.fn() }));

const mockToastShow = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: mockToastShow }) }));

jest.mock('@/providers/session', () => ({
  useSession: () => ({
    session: { user: { id: 'me' } },
    isLoaded: true,
    needsAgreement: false,
    markAgreementAccepted: jest.fn(),
    signOut: jest.fn(),
  }),
}));

const mockBlockUser = blockUser as jest.MockedFunction<typeof blockUser>;
const BLOCK_TARGET = { userId: 'them', displayName: 'Robin Cruz' };

beforeEach(() => {
  jest.clearAllMocks();
});

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


/**
 * A block that appears to work and didn't is the same shape as
 * everything else tonight — someone believes they're protected when
 * they aren't. So the failure path here gets the same weight as the
 * happy path, and confirmation is required before anything is written.
 */
describe('ReportAction — Block', () => {
  it('offers Block only when a blockTarget is supplied', async () => {
    Platform.OS = 'ios';
    const spy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});

    await render(<ReportAction targetType="post" targetId="p1" targetLabel="post" blockTarget={BLOCK_TARGET} />);
    await fireEvent.press(screen.getByLabelText('More options for this post'));

    const [config] = spy.mock.calls[0];
    expect(config.options).toEqual(['Report', 'Block', 'Cancel']);
    spy.mockRestore();
  });

  it('omits Block entirely when no blockTarget is supplied — never a broken or wrongly-targeted entry', async () => {
    Platform.OS = 'ios';
    const spy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});

    await render(<ReportAction targetType="club" targetId="c1" targetLabel="club" />);
    await fireEvent.press(screen.getByLabelText('More options for this club'));

    const [config] = spy.mock.calls[0];
    expect(config.options).toEqual(['Report', 'Cancel']);
    spy.mockRestore();
  });

  it('selecting Block asks for confirmation naming the person, and does not block yet', async () => {
    Platform.OS = 'ios';
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_config, callback) => {
      callback(1); // "Block" is index 1 when blockTarget is present
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    await render(<ReportAction targetType="post" targetId="p1" targetLabel="post" blockTarget={BLOCK_TARGET} />);
    await fireEvent.press(screen.getByLabelText('More options for this post'));

    expect(alertSpy).toHaveBeenCalledWith('Block Robin Cruz?', expect.any(String), expect.any(Array));
    expect(mockBlockUser).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('the confirmation copy states the roster/search carve-outs and that the person is not told', async () => {
    Platform.OS = 'ios';
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_config, callback) => {
      callback(1);
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    await render(<ReportAction targetType="post" targetId="p1" targetLabel="post" blockTarget={BLOCK_TARGET} />);
    await fireEvent.press(screen.getByLabelText('More options for this post'));

    const [, body] = alertSpy.mock.calls[0];
    expect(body).toContain("You'll still see each other on a game or club you already share");
    expect(body).toContain("won't be told");
    expect(body).toContain('show up in search');

    jest.restoreAllMocks();
  });

  it('only calls blockUser after confirming, never on the initial selection', async () => {
    Platform.OS = 'ios';
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_config, callback) => {
      callback(1);
    });
    mockBlockUser.mockResolvedValue(undefined);
    let confirmOnPress: (() => void) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      confirmOnPress = buttons?.find((b) => b.text === 'Block')?.onPress as (() => void) | undefined;
    });

    await render(<ReportAction targetType="post" targetId="p1" targetLabel="post" blockTarget={BLOCK_TARGET} />);
    await fireEvent.press(screen.getByLabelText('More options for this post'));

    expect(mockBlockUser).not.toHaveBeenCalled();
    confirmOnPress?.();

    await waitFor(() => expect(mockBlockUser).toHaveBeenCalledWith('me', 'them'));

    jest.restoreAllMocks();
  });

  it('confirms success — a block that worked must say so, not stay silent', async () => {
    Platform.OS = 'ios';
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_config, callback) => {
      callback(1);
    });
    mockBlockUser.mockResolvedValue(undefined);
    let confirmOnPress: (() => void) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      confirmOnPress = buttons?.find((b) => b.text === 'Block')?.onPress as (() => void) | undefined;
    });

    await render(<ReportAction targetType="post" targetId="p1" targetLabel="post" blockTarget={BLOCK_TARGET} />);
    await fireEvent.press(screen.getByLabelText('More options for this post'));
    confirmOnPress?.();

    await waitFor(() => {
      expect(mockToastShow).toHaveBeenCalledWith('Robin Cruz is blocked.', 'success');
    });

    jest.restoreAllMocks();
  });

  it('reports failure honestly rather than letting a failed block look like it worked', async () => {
    Platform.OS = 'ios';
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_config, callback) => {
      callback(1);
    });
    mockBlockUser.mockRejectedValue(new Error('network down'));
    let confirmOnPress: (() => void) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      confirmOnPress = buttons?.find((b) => b.text === 'Block')?.onPress as (() => void) | undefined;
    });

    await render(<ReportAction targetType="post" targetId="p1" targetLabel="post" blockTarget={BLOCK_TARGET} />);
    await fireEvent.press(screen.getByLabelText('More options for this post'));
    confirmOnPress?.();

    await waitFor(() => {
      expect(mockToastShow).toHaveBeenCalledWith(
        "We couldn't block them. Check your connection and try again.",
        'error'
      );
    });
    // Never the success message on a failure.
    expect(mockToastShow).not.toHaveBeenCalledWith(expect.stringContaining('is blocked.'), 'success');

    jest.restoreAllMocks();
  });
});